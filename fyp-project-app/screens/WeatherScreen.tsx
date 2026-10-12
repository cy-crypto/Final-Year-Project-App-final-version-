import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform, TouchableWithoutFeedback } from 'react-native';
import { ImageBackground } from 'expo-image';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../constants/theme';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { fetchWeatherByCity, fetchUVIndex, fetchAirPollution, type WeatherSnapshot } from '../services/weatherService';
import {
  addSavedLocation,
  deleteSavedLocation,
  getSavedLocations,
  type SavedLocationDto,
} from '../services/weatherLocationService';

export function WeatherScreen() {
  const { setWeather } = useAppContext();
  const { user, updateProfile } = useAuth();
  const [cityInput, setCityInput] = useState('London');
  const [weather, setLocalWeather] = useState<WeatherSnapshot | null>(null);
  const [savedLocations, setSavedLocations] = useState<SavedLocationDto[]>([]);
  const [savedWeatherByCity, setSavedWeatherByCity] = useState<Record<string, WeatherSnapshot>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [staleBanner, setStaleBanner] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [allowDeviceLocation, setAllowDeviceLocation] = useState(true);
  const [uvIndex, setUvIndex] = useState<number | null>(null);
  const [aqi, setAqi] = useState<number | null>(null);
  const [pollenLevel, setPollenLevel] = useState<'Low' | 'Moderate' | 'High'>('Low');
  const [runningCondition, setRunningCondition] = useState<{ status: 'Good' | 'Moderate' | 'Poor'; reason?: string }>({ status: 'Good' });

  const loadAdditionalData = async (lat: number, lon: number, temperature: number, humidity: number, windSpeed: number) => {
    try {
      // Fetch UV Index
      const uvData = await fetchUVIndex(lat, lon);
      if (uvData.uv_index !== undefined) {
        setUvIndex(uvData.uv_index);
      }

      // Fetch AQI
      const aqiData = await fetchAirPollution(lat, lon);
      if (aqiData.aqi !== undefined) {
        setAqi(aqiData.aqi);
      }

      // Calculate pollen level (estimated)
      const month = new Date().getMonth();
      const isPollenSeason = month >= 3 && month <= 9; // April to September
      let pollenEstimate: 'Low' | 'Moderate' | 'High' = 'Low';
      
      if (isPollenSeason && humidity < 70) {
        if (windSpeed > 15) {
          pollenEstimate = 'High';
        } else {
          pollenEstimate = 'Moderate';
        }
      }
      setPollenLevel(pollenEstimate);

      // Calculate running conditions
      let runningStatus: 'Good' | 'Moderate' | 'Poor' = 'Good';
      let runningReason = '';

      // Temperature considerations
      if (temperature < 0 || temperature > 30) {
        runningStatus = 'Poor';
        runningReason = temperature < 0 ? 'Too cold' : 'Too hot';
      } else if (temperature < 5 || temperature > 25) {
        runningStatus = 'Moderate';
        runningReason = temperature < 5 ? 'Cold conditions' : 'Warm conditions';
      }

      // AQI considerations
      if (aqiData.aqi !== undefined) {
        if (aqiData.aqi >= 151) {
          runningStatus = 'Poor';
          runningReason = runningReason ? `${runningReason}, poor air quality` : 'Poor air quality';
        } else if (aqiData.aqi >= 51) {
          if (runningStatus === 'Good') runningStatus = 'Moderate';
          runningReason = runningReason ? `${runningReason}, moderate air quality` : 'Moderate air quality';
        }
      }

      // Humidity considerations
      if (humidity > 80) {
        if (runningStatus === 'Good') runningStatus = 'Moderate';
        runningReason = runningReason ? `${runningReason}, high humidity` : 'High humidity';
      }

      setRunningCondition({ status: runningStatus, reason: runningReason });
    } catch (err) {
      console.warn('Failed to load additional weather data:', err);
    }
  };

  const cacheKeyForCity = (city: string) => `weather.cache.${city.trim().toLowerCase()}`;
  const deviceLocationKey = 'weather.useDeviceLocation';

  const persistWeatherCache = async (city: string, snapshot: WeatherSnapshot) => {
    try {
      const payload = {
        city: snapshot.city || city,
        savedAt: new Date().toISOString(),
        snapshot,
      };
      await AsyncStorage.setItem(cacheKeyForCity(city), JSON.stringify(payload));
    } catch (err) {
      console.warn('Failed to persist weather cache', err);
    }
  };

  const loadCachedWeather = async (city: string) => {
    try {
      const raw = await AsyncStorage.getItem(cacheKeyForCity(city));
      if (!raw) {
        return false;
      }
      const parsed = JSON.parse(raw) as { savedAt?: string; snapshot?: WeatherSnapshot };
      if (!parsed?.snapshot) {
        return false;
      }
      setLocalWeather(parsed.snapshot);
      setStaleBanner(true);
      setCachedAt(parsed.savedAt ?? null);
      return true;
    } catch (err) {
      console.warn('Failed to read cached weather', err);
      return false;
    }
  };

  const setDeviceLocationPreference = async (value: boolean) => {
    try {
      await AsyncStorage.setItem(deviceLocationKey, value ? 'true' : 'false');
    } catch (err) {
      console.warn('Failed to persist device location preference', err);
    } finally {
      setAllowDeviceLocation(value);
    }
  };

  const loadDeviceLocationPreference = async () => {
    try {
      const stored = await AsyncStorage.getItem(deviceLocationKey);
      if (stored === null) {
        return true;
      }
      return stored === 'true';
    } catch (err) {
      console.warn('Failed to read device location preference', err);
      return true;
    }
  };

  const loadSaved = async (refreshWeather = true) => {
    try {
      const rows = await getSavedLocations();
      setSavedLocations(rows);
      if (refreshWeather) {
        await refreshSavedLocationWeather(rows.map((row) => row.city));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load saved locations.';
      setError(message);
    }
  };

  const refreshSavedLocationWeather = async (cities: string[]) => {
    const uniqueCities = Array.from(new Set(cities.map((city) => city.trim()).filter(Boolean)));
    if (uniqueCities.length === 0) {
      return;
    }

    const settled = await Promise.allSettled(uniqueCities.map((city) => fetchWeatherByCity(city)));
    const nextMap: Record<string, WeatherSnapshot> = {};

    settled.forEach((entry, index) => {
      const cityKey = uniqueCities[index];
      if (entry.status === 'fulfilled') {
        nextMap[cityKey.toLowerCase()] = entry.value;
      }
    });

    setSavedWeatherByCity((prev) => ({ ...prev, ...nextMap }));
  };

  const loadByCity = async (city: string, persistSelection = true, silent = false) => {
    const clean = city.trim();
    if (!clean) {
      setError('Please enter a city name.');
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    if (!silent) {
      setError(null);
      setNotice(null);
    }

    try {
      const snapshot = await fetchWeatherByCity(clean);
      setLocalWeather({ ...snapshot, city: snapshot.city || clean });
      setSavedWeatherByCity((prev) => ({
        ...prev,
        [clean.toLowerCase()]: { ...snapshot, city: snapshot.city || clean },
      }));
      setStaleBanner(false);
      setCachedAt(null);
      await persistWeatherCache(clean, { ...snapshot, city: snapshot.city || clean });
      setWeather({
        city: snapshot.city || clean,
        temperatureC: snapshot.temperatureC,
        condition: snapshot.condition,
        updatedAt: snapshot.updatedAt,
      });

      // Load additional data if coordinates are available
      if (snapshot.lat && snapshot.lon) {
        console.log('Loading additional data for:', snapshot.city, 'lat:', snapshot.lat, 'lon:', snapshot.lon);
        await loadAdditionalData(
          snapshot.lat,
          snapshot.lon,
          snapshot.temperatureC,
          snapshot.humidity,
          snapshot.windSpeedKph || 0
        );
      } else {
        console.log('No coordinates available for:', snapshot.city, 'lat:', snapshot.lat, 'lon:', snapshot.lon);
      }

      if (persistSelection) {
        await setDeviceLocationPreference(false);
      }

      setShowLocationPicker(false);

      if (persistSelection) {
        await updateProfile({ selectedCity: snapshot.city || clean });
      }
      if (!silent) {
        setNotice(`Showing latest weather for ${snapshot.city || clean}.`);
      }

      // Debug logging to check snapshot data
      console.log('WEATHER SNAPSHOT:', JSON.stringify(snapshot, null, 2));
      console.log('LAT:', snapshot.lat, 'LON:', snapshot.lon);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to fetch weather for that city.';
      if (!silent) {
        setError(message);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadByLocation = async (permissionGranted?: boolean) => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (!permissionGranted) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          setError('Location permission denied.');
          setLocationDenied(true);
          return;
        }
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const reverse = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      const resolvedCity =
        reverse[0]?.city || reverse[0]?.subregion || reverse[0]?.region || reverse[0]?.district;

      if (!resolvedCity) {
        setError('Unable to detect city from current location.');
        return;
      }

      const snapshot = await fetchWeatherByCity(resolvedCity);

      setLocalWeather(snapshot);
      setStaleBanner(false);
      setCachedAt(null);
      await persistWeatherCache(resolvedCity, snapshot);
      setWeather({
        city: snapshot.city,
        temperatureC: snapshot.temperatureC,
        condition: snapshot.condition,
        updatedAt: snapshot.updatedAt,
      });
      setCityInput(snapshot.city);
      
      // Load additional data if coordinates are available
      if (snapshot.lat && snapshot.lon) {
        console.log('Loading additional data for:', snapshot.city, 'lat:', snapshot.lat, 'lon:', snapshot.lon);
        await loadAdditionalData(
          snapshot.lat,
          snapshot.lon,
          snapshot.temperatureC,
          snapshot.humidity,
          snapshot.windSpeedKph || 0
        );
      } else {
        console.log('No coordinates available for:', snapshot.city, 'lat:', snapshot.lat, 'lon:', snapshot.lon);
      }
      await updateProfile({ selectedCity: snapshot.city });
      setNotice(`Using device location: ${snapshot.city}.`);
      setShowLocationPicker(false);
      setLocationDenied(false);
      await setDeviceLocationPreference(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to fetch weather using device location.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCurrentCity = async () => {
    const clean = cityInput.trim();
    if (!clean) {
      setError('Enter a city before saving location.');
      return;
    }

    setError(null);
    setNotice(null);

    try {
      await addSavedLocation(clean);
      await loadSaved(false);
      await refreshSavedLocationWeather([clean]);
      await updateProfile({ selectedCity: clean });
      setNotice(`${clean} saved to your locations.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save location.';
      setError(message);
    }
  };

  const handleDeleteLocation = async (id: string) => {
    try {
      await deleteSavedLocation(id);
      await loadSaved(false);
      setNotice('Saved location removed.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete location.';
      setError(message);
    }
  };

  useEffect(() => {
    const selectedCity = user?.selectedCity?.trim();
    const initialCity = selectedCity || 'London';
    setCityInput(initialCity);

    let cancelled = false;
    const bootstrap = async () => {
      await loadCachedWeather(initialCity);
      const allowDevice = await loadDeviceLocationPreference();
      if (!cancelled) {
        setAllowDeviceLocation(allowDevice);
      }
      try {
        if (selectedCity) {
          await loadByCity(selectedCity, false, true);
          return;
        }

        if (allowDevice) {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status === 'granted') {
            if (!cancelled) {
              await loadByLocation(true);
              return;
            }
          } else {
            setLocationDenied(true);
          }
        }

        await loadByCity(initialCity, false);
      } catch (err) {
        await loadByCity(initialCity, false);
      }
      if (!cancelled) {
        loadSaved();
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [user?.selectedCity]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const cities = savedLocations.map((location) => location.city);
      if (cities.length > 0) {
        refreshSavedLocationWeather(cities);
      }
      if (weather?.city) {
        loadByCity(weather.city, false, true);
      }
    }, 90000);

    return () => clearInterval(intervalId);
  }, [savedLocations, weather?.city]);

  const formatTemp = (value: number | undefined, suffix = '°C') =>
    Number.isFinite(value) ? `${Number(value).toFixed(0)}${suffix}` : '--';

  const minText = formatTemp(weather?.minC);
  const maxText = formatTemp(weather?.maxC);
  const temperature = formatTemp(weather?.temperatureC);

  const conditionLabel = weather?.condition ?? 'Unknown';
  const isNightNowForCity = isNightForTimestamp(Date.now() / 1000, weather);
  const displayCondition =
    conditionLabel === 'Sunny' && isNightNowForCity ? 'Clear' : conditionLabel;
  const backgroundUri = resolveWeatherBackground(conditionLabel, weather?.updatedAt);
  const emojiIcon = resolveWeatherEmoji(conditionLabel, isNightNowForCity);
  const summaryText = buildConditionSummary(displayCondition);
  const windText = Number.isFinite(weather?.windSpeedKph)
    ? `${Number(weather?.windSpeedKph).toFixed(0)} km/h`
    : '--';
  const hourlyItems = Array.isArray(weather?.hourly) ? weather?.hourly ?? [] : [];
  const dailyItems = Array.isArray(weather?.daily) ? weather?.daily ?? [] : [];

  return (
    <View style={styles.container}>
      {/* TOP SECTION - fixed, not scrollable */}
      <ImageBackground
        source={{ uri: backgroundUri }}
        style={styles.heroImage}>
        <View style={styles.heroOverlay}>
          {/* Header row */}
          <View style={styles.headerRow}>
            <Text style={styles.headerCity}>{weather?.city ?? 'No data yet'}</Text>
            <Pressable onPress={() => setShowLocationPicker(true)}>
              <Ionicons name="locate" size={24} color="#fff" />
            </Pressable>
          </View>

          {/* Temperature and condition */}
          <Text style={styles.heroTemp}>{temperature}</Text>
          <Text style={styles.heroCondition}>{displayCondition}</Text>
          <Text style={styles.heroHighLow}>H: {maxText} L: {minText}</Text>
        </View>
      </ImageBackground>

      {/* WEATHER CARDS - fixed, not scrollable */}
      <View style={styles.weatherCardsRow}>
        <View style={styles.weatherCard}>
          <Text style={styles.weatherCardIcon}>💧</Text>
          <Text style={styles.weatherCardLabel}>Humidity</Text>
          <Text style={styles.weatherCardValue}>{Number.isFinite(weather?.humidity) ? `${weather?.humidity}%` : '--'}</Text>
        </View>
        <View style={styles.weatherCard}>
          <Text style={styles.weatherCardIcon}>💨</Text>
          <Text style={styles.weatherCardLabel}>Wind</Text>
          <Text style={styles.weatherCardValue}>{windText}</Text>
        </View>
        <View style={styles.weatherCard}>
          <Text style={styles.weatherCardIcon}>☀️</Text>
          <Text style={styles.weatherCardLabel}>UV Index</Text>
          <Text style={styles.weatherCardValue}>{uvIndex !== null ? uvIndex.toFixed(1) : '--'}</Text>
        </View>
      </View>

      {/* SCROLLABLE SECTION */}
      <ScrollView style={styles.scrollView}>
        {/* Hourly Forecast */}
        <Text style={styles.sectionTitle}>Hourly Forecast</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourlyRow}>
          {hourlyItems.length > 0 ? (
            hourlyItems.map((hour, index) => (
              <View key={`${hour.dt || 0}-${index}`} style={styles.hourCard}>
                <Text style={styles.hourTime}>{formatHour(hour.dt, weather?.timezoneOffset)}</Text>
                <Text style={styles.hourEmoji}>
                  {resolveWeatherEmoji(hour.condition ?? conditionLabel, isNightForTimestamp(hour.dt, weather))}
                </Text>
                <Text style={styles.hourTemp}>{formatTemp(hour.temp)}</Text>
                <Text style={styles.hourPop}>
                  Precip: {formatPop(resolvePrecip(hour.pop, hour.condition ?? conditionLabel))}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No hourly data yet.</Text>
          )}
        </ScrollView>

        {/* Daily Forecast */}
        <Text style={styles.sectionTitle}>Daily Forecast</Text>
        <View style={styles.dailyList}>
          {dailyItems.length > 0 ? (
            dailyItems.map((day, index) => (
              <View key={`${day.dt || 0}-${index}`} style={styles.dailyRow}>
                <Text style={styles.dailyDay}>{formatDay(day.date, day.dt, index)}</Text>
                <Text style={styles.dailyEmoji}>
                  {resolveWeatherEmoji(
                    day.condition ?? conditionLabel,
                    isNightForTimestamp(day.dt ? day.dt + 43200 : undefined, weather)
                  )}
                </Text>
                <View style={styles.dailyMeta}>
                  <Text style={styles.dailyTemps}>H: {formatTemp(day.temp_max)}  L: {formatTemp(day.temp_min)}</Text>
                  <Text style={styles.dailyPop}>
                    Precip: {formatPop(resolvePrecip(day.pop, day.condition ?? conditionLabel))}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No daily data yet.</Text>
          )}
        </View>

        {/* Air Quality & Conditions */}
        <Text style={styles.sectionTitle}>Air Quality & Conditions</Text>
        <View style={styles.bottomCardsRow}>
          <View style={styles.bottomCard}>
            <Text style={styles.bottomCardIcon}>🌸</Text>
            <Text style={styles.bottomCardLabel}>Pollen</Text>
            <Text style={styles.bottomCardValue}>{pollenLevel}</Text>
          </View>
          <View style={styles.bottomCard}>
            <Text style={styles.bottomCardIcon}>💨</Text>
            <Text style={styles.bottomCardLabel}>AQI</Text>
            <Text style={styles.bottomCardValue}>
              {aqi !== null ? getAQILabel(aqi) : '--'}
            </Text>
          </View>
          <View style={styles.bottomCard}>
            <Text style={styles.bottomCardIcon}>🏃</Text>
            <Text style={styles.bottomCardLabel}>Running</Text>
            <Text style={styles.bottomCardValue}>
              {runningCondition.status}
              {runningCondition.reason ? `\n(${runningCondition.reason})` : ''}
            </Text>
          </View>
        </View>

        {/* Error and notice messages */}
        {staleBanner ? (
          <Text style={styles.staleBanner}>
            Showing cached forecast{cachedAt ? ` from ${formatCachedTime(cachedAt)}` : ''}. It may be outdated.
          </Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </ScrollView>

      {/* LOCATION PICKER - absolute overlay */}
      {showLocationPicker && (
        <View style={styles.pickerOverlay}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.pickerOverlay}
          >
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Change Location</Text>
                <Pressable onPress={() => setShowLocationPicker(false)}>
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>

              <View style={styles.searchRow}>
                <TextInput
                  value={cityInput}
                  onChangeText={setCityInput}
                  placeholder="Enter city"
                  style={styles.input}
                  autoCapitalize="words"
                  editable={true}
                  focusable={true}
                />
                <Pressable style={styles.button} onPress={async () => {
                  console.log('Search button pressed, cityInput:', cityInput);
                  await loadByCity(cityInput);
                  setShowLocationPicker(false);
                }} disabled={loading}>
                  <Text style={styles.buttonText}>Search</Text>
                </Pressable>
              </View>

              <Pressable style={styles.locationButton} onPress={async () => {
                console.log('Use Device Location button pressed');
                await loadByLocation();
                setShowLocationPicker(false);
              }} disabled={loading}>
                <Text style={styles.locationButtonText}>Use Device Location</Text>
              </Pressable>

              <Pressable style={styles.saveLocationButton} onPress={handleSaveCurrentCity} disabled={loading}>
                <Text style={styles.locationButtonText}>Save This City</Text>
              </Pressable>

              <Text style={styles.savedTitle}>Saved Locations</Text>
              {savedLocations.length === 0 ? (
                <Text style={styles.emptyText}>No saved locations yet.</Text>
              ) : (
                savedLocations.map((location) => (
                  <Pressable key={location.id} style={styles.savedPickRow} onPress={() => loadByCity(location.city)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.savedCity}>{location.city}</Text>
                      <Text style={styles.savedMeta}>
                        {savedWeatherByCity[location.city.toLowerCase()]
                          ? `${formatTemp(savedWeatherByCity[location.city.toLowerCase()].temperatureC)} • ${savedWeatherByCity[location.city.toLowerCase()].condition}`
                          : 'Updating latest weather...'}
                      </Text>
                    </View>
                    <Text style={styles.pickChevron}>›</Text>
                  </Pressable>
                ))
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );
}

// Helper functions
const resolveWeatherBackground = (condition: string, updatedAt?: string): string => {
  const c = condition?.toLowerCase() ?? '';
  
  if (c.includes('thunder') || c.includes('storm')) {
    return 'https://images.unsplash.com/photo-1605727216801-e27ce1d0cc28?w=1200&q=80';
  }
  if (c.includes('snow') || c.includes('blizzard')) {
    return 'https://images.unsplash.com/photo-1491002052546-bf38f186af56?w=1200&q=80';
  }
  if (c.includes('rain') || c.includes('drizzle')) {
    return 'https://images.unsplash.com/photo-1428592953211-077101b2021b?w=1200&q=80';
  }
  if (c.includes('haze') || c.includes('hazy') || c.includes('fog') || c.includes('mist') || c.includes('smoke')) {
    return 'https://images.unsplash.com/photo-1485236715568-ddc5ee6ca227?w=1200&q=80';
  }
  if (c.includes('cloud') || c.includes('overcast')) {
    return 'https://images.unsplash.com/photo-1499956827185-0d63ee78a910?w=1200&q=80';
  }
  if (c.includes('wind') || c.includes('breezy')) {
    return 'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=1200&q=80';
  }
  if (c.includes('sunny') || c.includes('clear')) {
    // Check if night
    return 'https://images.unsplash.com/photo-1601297183305-6df142704ea2?w=1200&q=80';
  }
  // Default
  return 'https://images.unsplash.com/photo-1504608524841-42584120d693?w=1200&q=80';
};

function resolveWeatherEmoji(condition?: string, isNight?: boolean) {
  const normalized = (condition || '').toLowerCase();
  if (normalized.includes('sunny') || normalized.includes('clear')) {
    return isNight ? '🌙' : '🌞';
  }
  if (normalized.includes('cloud')) {
    return '🌥️';
  }
  if (normalized.includes('rain')) {
    return '🌧️';
  }
  if (normalized.includes('storm')) {
    return '⛈️';
  }
  if (normalized.includes('snow')) {
    return '🌨️';
  }
  if (normalized.includes('hazy') || normalized.includes('smoke') || normalized.includes('mist')) {
    return '😶‍🌫️';
  }

  return '🌥️';
}

function isNightForTimestamp(timestamp?: number, snapshot?: WeatherSnapshot | null) {
  if (!timestamp) {
    return isNightNow(snapshot);
  }

  const times = getSunTimesForTimestamp(timestamp, snapshot);
  if (times) {
    return timestamp < times.sunrise || timestamp >= times.sunset;
  }

  const hour = getCityHour(timestamp, snapshot?.timezoneOffset);
  if (hour === null) {
    return isNightNow(snapshot);
  }
  return hour < 6 || hour >= 19;
}

function getSunTimesForTimestamp(timestamp: number, snapshot?: WeatherSnapshot | null) {
  const daily = snapshot?.daily;
  if (Array.isArray(daily) && daily.length > 0) {
    const match = daily.find((day) => {
      const start = Number(day.dt ?? 0);
      return start > 0 && timestamp >= start && timestamp < start + 86400;
    });
    if (match && typeof match.sunrise === 'number' && typeof match.sunset === 'number') {
      return { sunrise: match.sunrise, sunset: match.sunset };
    }
  }

  if (typeof snapshot?.sunrise === 'number' && typeof snapshot?.sunset === 'number') {
    return { sunrise: snapshot.sunrise, sunset: snapshot.sunset };
  }

  return null;
}

function isNightNow(snapshot?: WeatherSnapshot | null) {
  try {
    const timestamp = Date.now() / 1000;
    const hour = getCityHour(timestamp, snapshot?.timezoneOffset);
    if (hour === null) {
      const local = new Date().getHours();
      return local < 6 || local >= 19;
    }
    return hour < 6 || hour >= 19;
  } catch {
    return false;
  }
}

function buildConditionSummary(condition: string) {
  const normalized = condition.toLowerCase();
  if (normalized.includes('sunny')) {
    return 'Clear conditions tonight, continuing through morning.';
  }
  if (normalized.includes('cloud')) {
    return 'Cloud cover tonight, continuing through morning.';
  }
  if (normalized.includes('rain')) {
    return 'Rain likely tonight, continuing through morning.';
  }
  if (normalized.includes('storm')) {
    return 'Stormy conditions tonight, continuing through morning.';
  }
  if (normalized.includes('snow')) {
    return 'Snow expected tonight, continuing through morning.';
  }
  if (normalized.includes('hazy') || normalized.includes('smoke') || normalized.includes('mist')) {
    return 'Hazy conditions tonight, continuing through morning.';
  }
  return 'Conditions tonight, continuing through morning.';
}

function formatHour(timestamp?: number, timezoneOffset?: number) {
  if (!timestamp) {
    return '--';
  }
  try {
    const adjusted = typeof timezoneOffset === 'number' ? timestamp + timezoneOffset : timestamp;
    return new Date(adjusted * 1000).toLocaleTimeString([], { hour: 'numeric' });
  } catch {
    return '--';
  }
}

function getCityHour(timestamp: number, timezoneOffset?: number) {
  if (typeof timezoneOffset !== 'number') {
    return null;
  }
  try {
    const adjusted = timestamp + timezoneOffset;
    return new Date(adjusted * 1000).getUTCHours();
  } catch {
    return null;
  }
}

function formatDay(dateText?: string, dtSeconds?: number, index?: number) {
  if (dateText) {
    try {
      return new Date(dateText).toLocaleDateString([], { weekday: 'short' });
    } catch {
      // fall through to dtSeconds
    }
  }

  if (typeof dtSeconds === 'number' && dtSeconds > 0) {
    try {
      const date = new Date(dtSeconds * 1000);
      return date.toLocaleDateString([], { weekday: 'short' });
    } catch {
      // fall through to index
    }
  }

  if (typeof index === 'number') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date().getDay();
    const targetDay = (today + index) % 7;
    return index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : days[targetDay];
  }

  return '--';
}

function formatPop(pop?: number) {
  if (typeof pop !== 'number' || pop < 0) {
    return '--';
  }
  return `${Math.round(pop * 100)}%`;
}

function resolvePrecip(pop?: number, condition?: string) {
  const normalized = (condition || '').toLowerCase();
  const isPrecipCondition = normalized.includes('rain') || normalized.includes('drizzle') || normalized.includes('storm') || normalized.includes('snow');
  
  if (isPrecipCondition && (typeof pop !== 'number' || pop < 0.1)) {
    return 0.3; // Default 30% for precip conditions
  }
  
  return pop ?? 0;
}

function formatCachedTime(cachedAt?: string | null) {
  if (!cachedAt) {
    return null;
  }
  try {
    const date = new Date(cachedAt);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return null;
  }
}

function getAQILabel(aqi: number): string {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: Colors.bgDark 
  },
  heroImage: { 
    width: '100%', 
    height: 300 
  },
  heroOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.3)', 
    padding: 20, 
    justifyContent: 'flex-end' 
  },
  headerRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 8 
  },
  headerCity: { 
    fontSize: 24, 
    fontWeight: '700', 
    color: '#fff' 
  },
  heroTemp: { 
    fontSize: 64, 
    fontWeight: '200', 
    color: '#fff' 
  },
  heroCondition: { 
    fontSize: 18, 
    color: '#fff', 
    opacity: 0.9 
  },
  heroHighLow: { 
    fontSize: 14, 
    color: '#fff', 
    opacity: 0.7, 
    marginTop: 4 
  },
  weatherCardsRow: { 
    flexDirection: 'row', 
    backgroundColor: Colors.surfaceDark, 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    gap: 8 
  },
  weatherCard: { 
    flex: 1, 
    backgroundColor: 'rgba(29,158,117,0.15)', 
    borderRadius: 12, 
    padding: 12, 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: Colors.primary + '40' 
  },
  weatherCardIcon: { 
    fontSize: 22 
  },
  weatherCardLabel: { 
    fontSize: 11, 
    color: Colors.textSecondaryDark, 
    marginTop: 4 
  },
  weatherCardValue: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: Colors.textPrimaryDark, 
    marginTop: 2 
  },
  scrollView: { 
    flex: 1, 
    backgroundColor: Colors.bgDark 
  },
  sectionTitle: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: Colors.textPrimaryDark, 
    paddingHorizontal: 16, 
    paddingTop: 16, 
    paddingBottom: 8 
  },
  pickerOverlay: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    bottom: 0, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'flex-end' 
  },
  pickerSheet: { 
    backgroundColor: Colors.surfaceDark, 
    borderTopLeftRadius: 20, 
    borderTopRightRadius: 20, 
    padding: 20, 
    maxHeight: '80%' 
  },
  // Additional styles for existing components
  hourlyRow: {
    paddingHorizontal: 16,
    gap: 12,
  },
  hourCard: {
    backgroundColor: 'rgba(29,158,117,0.15)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    minWidth: 80,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  hourTime: {
    fontSize: 12,
    color: Colors.textSecondaryDark,
    marginBottom: 4,
  },
  hourEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  hourTemp: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimaryDark,
    marginBottom: 2,
  },
  hourPop: {
    fontSize: 10,
    color: Colors.textSecondaryDark,
  },
  dailyList: {
    paddingHorizontal: 16,
  },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDark,
  },
  dailyDay: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimaryDark,
    flex: 1,
  },
  dailyEmoji: {
    fontSize: 20,
    marginHorizontal: 16,
  },
  dailyMeta: {
    flex: 2,
    alignItems: 'flex-end',
  },
  dailyTemps: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimaryDark,
  },
  dailyPop: {
    fontSize: 12,
    color: Colors.textSecondaryDark,
    marginTop: 2,
  },
  bottomCardsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 8,
  },
  bottomCard: {
    flex: 1,
    backgroundColor: 'rgba(29,158,117,0.15)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  bottomCardIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  bottomCardLabel: {
    fontSize: 12,
    color: Colors.textSecondaryDark,
    marginBottom: 4,
  },
  bottomCardValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimaryDark,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondaryDark,
    textAlign: 'center',
    padding: 20,
  },
  staleBanner: {
    fontSize: 12,
    color: '#ffa500',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,165,0,0.1)',
  },
  error: {
    fontSize: 14,
    color: '#ff6b6b',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  notice: {
    fontSize: 14,
    color: '#51cf66',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimaryDark,
  },
  closeText: {
    fontSize: 16,
    color: '#007AFF',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: 'rgba(29,158,117,0.15)',
    borderRadius: 12,
    paddingHorizontal: 16,
    color: Colors.textPrimaryDark,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    height: 48,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  locationButton: {
    backgroundColor: 'rgba(0,122,255,0.2)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  saveLocationButton: {
    backgroundColor: 'rgba(76,175,80,0.2)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  locationButtonText: {
    color: Colors.textPrimaryDark,
    fontSize: 16,
    fontWeight: '600',
  },
  savedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimaryDark,
    marginBottom: 12,
  },
  savedPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDark,
  },
  savedCity: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimaryDark,
  },
  savedMeta: {
    fontSize: 12,
    color: Colors.textSecondaryDark,
    marginTop: 2,
  },
  pickChevron: {
    fontSize: 20,
    color: Colors.textSecondaryDark,
  },
});
