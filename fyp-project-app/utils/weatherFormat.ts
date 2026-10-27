import { Colors } from '../constants/theme';
import type { IconName } from '../components/module/ModuleUI';
import type { WeatherSnapshot } from '../services/weatherService';

export function weatherIcon(condition?: string, night = false): IconName {
  switch (condition) {
    case 'Sunny':
    case 'Clear':
      return night ? 'moon' : 'sunny';
    case 'Cloudy':
      return night ? 'cloudy-night' : 'partly-sunny';
    case 'Rainy':
      return 'rainy';
    case 'Stormy':
      return 'thunderstorm';
    case 'Snowy':
      return 'snow';
    case 'Hazy':
      return 'cloud';
    case 'Windy':
      return 'flag';
    default:
      return 'cloudy';
  }
}

/** True when `timestamp` (unix seconds) is between sunset and sunrise for the snapshot's city. */
export function isNight(snapshot: WeatherSnapshot | null, timestamp = Date.now() / 1000) {
  if (!snapshot?.sunrise || !snapshot?.sunset) {
    const hour = new Date(timestamp * 1000).getHours();
    return hour < 6 || hour >= 19;
  }
  // Compare by time of day so forecast hours on other days work too.
  const secondsOfDay = (t: number) => (((t + (snapshot.timezoneOffset ?? 0)) % 86400) + 86400) % 86400;
  const t = secondsOfDay(timestamp);
  return t < secondsOfDay(snapshot.sunrise) || t >= secondsOfDay(snapshot.sunset);
}

/** Clock time in the city's own time zone. */
export function cityTime(timestamp?: number, timezoneOffset?: number, withMinutes = false) {
  if (!timestamp) return '--';
  const d = new Date((timestamp + (timezoneOffset ?? -new Date().getTimezoneOffset() * 60)) * 1000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const hour = h % 12 === 0 ? 12 : h % 12;
  return withMinutes ? `${hour}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` : `${hour} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function dayLabel(date: string, index: number) {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
}

/** OpenWeather air quality index is 1 (good) to 5 (very poor). */
export function aqiInfo(aqi: number | null): { label: string; color: string } {
  switch (aqi) {
    case 1:
      return { label: 'Good', color: Colors.success };
    case 2:
      return { label: 'Fair', color: Colors.success };
    case 3:
      return { label: 'Moderate', color: Colors.warning };
    case 4:
      return { label: 'Poor', color: Colors.error };
    case 5:
      return { label: 'Very poor', color: Colors.error };
    default:
      return { label: '--', color: Colors.textSecondary };
  }
}

export function uvInfo(uv: number | null): { label: string; color: string } {
  if (uv === null || !Number.isFinite(uv)) return { label: '--', color: Colors.textSecondary };
  if (uv < 3) return { label: 'Low', color: Colors.success };
  if (uv < 6) return { label: 'Moderate', color: Colors.warning };
  if (uv < 8) return { label: 'High', color: Colors.accentOlive };
  return { label: 'Very high', color: Colors.error };
}

/** A one-line verdict for being active outside, from temperature, air quality, rain and wind. */
export function outdoorAdvice(w: WeatherSnapshot, aqi: number | null): { status: 'Good' | 'Fair' | 'Poor'; reason: string } {
  const reasons: string[] = [];
  let score = 0;
  const t = w.temperatureC;
  if (t > 35 || t < 0) {
    score += 2;
    reasons.push(t > 35 ? 'very hot' : 'freezing');
  } else if (t > 30 || t < 5) {
    score += 1;
    reasons.push(t > 30 ? 'hot' : 'cold');
  }
  if (aqi !== null && aqi >= 4) {
    score += 2;
    reasons.push('poor air quality');
  } else if (aqi === 3) {
    score += 1;
    reasons.push('moderate air quality');
  }
  if (w.condition === 'Rainy' || w.condition === 'Stormy') {
    score += 2;
    reasons.push(w.condition === 'Stormy' ? 'storms' : 'rain');
  }
  if ((w.windSpeedKph ?? 0) > 40) {
    score += 1;
    reasons.push('windy');
  }
  if (w.humidity > 85) {
    score += 1;
    reasons.push('humid');
  }
  const status = score >= 2 ? 'Poor' : score === 1 ? 'Fair' : 'Good';
  return { status, reason: reasons.length ? reasons.join(', ') : 'Pleasant conditions' };
}
