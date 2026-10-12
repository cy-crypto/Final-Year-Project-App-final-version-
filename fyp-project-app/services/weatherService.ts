import axios from 'axios';
import { api, parseJsonData, toApiErrorMessage } from './api';

type BackendWeatherResponse = {
  city?: string;
  lat?: number;
  lon?: number;
  timezone_offset?: number;
  current?: {
    temp?: number;
    feels_like?: number;
    humidity?: number;
    pressure?: number;
    wind_speed?: number;
    wind_deg?: number;
    visibility?: number;
    clouds?: number;
    sunrise?: number | null;
    sunset?: number | null;
    temp_min?: number;
    temp_max?: number;
    weather?:
      | { main?: string; description?: string; icon?: string }
      | Array<{ main?: string; description?: string; icon?: string }>;
  };
  hourly?: Array<{ dt?: number; temp?: number; feels_like?: number; pop?: number; humidity?: number; weather?: any }>;
  daily?: Array<any>;
};

export type WeatherSnapshot = {
  city: string;
  lat?: number;
  lon?: number;
  temperatureC: number;
  feelsLikeC?: number;
  windSpeedKph?: number;
  sunrise?: number;
  sunset?: number;
  timezoneOffset?: number;
  condition: string;
  description?: string;
  icon?: string;
  minC: number;
  maxC: number;
  humidity: number;
  hourly?: Array<{ dt: number; temp: number; pop?: number; humidity?: number; condition?: string; icon?: string }>;
  daily?: Array<{
    dt: number;
    date: string;
    temp_min: number;
    temp_max: number;
    sunrise?: number;
    sunset?: number;
    pop?: number;
    humidity?: number;
    condition?: string;
  }>;
  updatedAt: string;
};

export async function fetchWeatherByCity(city: string) {
  let response;
  try {
    response = await api.get<BackendWeatherResponse>('/weather/', {
      params: { city },
    });
  } catch (error) {
    throw toReadableWeatherError(error);
  }

  const payload = parseJsonData<BackendWeatherResponse>(response.data);

  const current = payload.current || {};
  const temp = Number(current.temp ?? NaN);
  const feels = Number(current.feels_like ?? NaN);
  const humidity = Number(current.humidity ?? 0);
  const windSpeed = Number(current.wind_speed ?? NaN);
  const resolvedCity = payload.city?.trim() || city;
  const description =
    (current.weather && (current.weather as any).description) ||
    (Array.isArray(current.weather) && current.weather[0] && current.weather[0].description) ||
    undefined;

  // derive min/max from daily[0] if present, otherwise fall back to hourly slice
  let min = NaN;
  let max = NaN;
  if (Array.isArray(payload.daily) && payload.daily.length > 0) {
    const d0 = payload.daily[0];
    min = Number(d0?.temp?.min ?? d0?.temp_min ?? NaN);
    max = Number(d0?.temp?.max ?? d0?.temp_max ?? NaN);
  }

  if (!Number.isFinite(min)) {
    min = Number(current.temp_min ?? NaN);
  }
  if (!Number.isFinite(max)) {
    max = Number(current.temp_max ?? NaN);
  } else if (Array.isArray(payload.hourly) && payload.hourly.length > 0) {
    const temps = payload.hourly.slice(0, 24).map((h) => Number(h.temp ?? NaN)).filter((t) => Number.isFinite(t));
    if (temps.length > 0) {
      min = Math.min(...temps);
      max = Math.max(...temps);
    }
  }

  const hourly = Array.isArray(payload.hourly)
    ? payload.hourly.slice(0, 12).map((h) => ({
        dt: Number(h.dt ?? 0),
        temp: Number(h.temp ?? NaN),
        pop: Number.isFinite(Number(h.pop)) ? Number(h.pop) : undefined,
        humidity: Number.isFinite(Number(h.humidity)) ? Number(h.humidity) : undefined,
        condition: (h.weather && h.weather[0] && h.weather[0].main) || undefined,
        icon: (h.weather && h.weather[0] && h.weather[0].icon) || undefined,
      }))
    : undefined;

  const daily = Array.isArray(payload.daily)
    ? payload.daily.slice(0, 5).map((d) => {
        const dt = Number(d?.dt ?? d?.date ?? NaN);
        return {
          dt: Number.isFinite(dt) ? dt : 0,
          date: toIsoDateFromSeconds(dt),
          temp_min: Number(d?.temp?.min ?? d?.temp_min ?? NaN),
          temp_max: Number(d?.temp?.max ?? d?.temp_max ?? NaN),
          sunrise: typeof d?.sunrise === 'number' ? d.sunrise : undefined,
          sunset: typeof d?.sunset === 'number' ? d.sunset : undefined,
          pop: Number.isFinite(Number(d?.pop)) ? Number(d.pop) : undefined,
          humidity: Number.isFinite(Number(d?.humidity)) ? Number(d.humidity) : undefined,
          condition: (d?.weather && d.weather[0] && d.weather[0].main) || undefined,
        };
      })
    : undefined;

  return {
    city: resolvedCity,
    lat: payload.lat,
    lon: payload.lon,
    temperatureC: Number.isFinite(temp) ? temp : NaN,
    feelsLikeC: Number.isFinite(feels) ? feels : undefined,
    windSpeedKph: Number.isFinite(windSpeed) ? windSpeed * 3.6 : undefined,
    sunrise: typeof current.sunrise === 'number' ? current.sunrise : undefined,
    sunset: typeof current.sunset === 'number' ? current.sunset : undefined,
    timezoneOffset: typeof payload.timezone_offset === 'number' ? payload.timezone_offset : undefined,
    condition: normalizeCondition(
      (current.weather && (current.weather as any).main) ||
        (Array.isArray(current.weather) && current.weather[0] && current.weather[0].main) ||
        'Unknown'
    ),
    description: typeof description === 'string' && description.trim() ? description : undefined,
    icon:
      (current.weather && (current.weather as any).icon) ||
      (Array.isArray(current.weather) && current.weather[0] && current.weather[0].icon) ||
      undefined,
    minC: Number.isFinite(min) ? min : (Number.isFinite(temp) ? temp : 0),
    maxC: Number.isFinite(max) ? max : (Number.isFinite(temp) ? temp : 0),
    humidity: humidity,
    hourly,
    daily,
    updatedAt: new Date().toLocaleTimeString(),
  } satisfies WeatherSnapshot;
}

export async function fetchUVIndex(lat: number, lon: number) {
  try {
    const response = await api.get('/weather/uv/', {
      params: { lat, lon },
    });
    return parseJsonData<{ uv_index?: number; uv_date?: string }>(response.data);
  } catch (error) {
    throw toReadableWeatherError(error);
  }
}

export async function fetchAirPollution(lat: number, lon: number) {
  try {
    const response = await api.get('/weather/air-pollution/', {
      params: { lat, lon },
    });
    return parseJsonData<{
      aqi?: number;
      co?: number;
      no?: number;
      no2?: number;
      o3?: number;
      so2?: number;
      pm2_5?: number;
      pm10?: number;
      nh3?: number;
    }>(response.data);
  } catch (error) {
    throw toReadableWeatherError(error);
  }
}

function toReadableWeatherError(error: unknown) {
  if (axios.isAxiosError(error)) {
    return new Error(toApiErrorMessage(error, 'Unable to load weather right now.'));
  }

  return new Error('Unable to fetch weather right now.');
}

function normalizeCondition(value: string) {
  const lower = value.trim().toLowerCase();
  if (!lower || lower === 'unknown') {
    return 'Cloudy';
  }
  if (lower.includes('clear') || lower.includes('sun')) {
    return 'Sunny';
  }
  if (lower.includes('cloud')) {
    return 'Cloudy';
  }
  if (lower.includes('rain') || lower.includes('drizzle')) {
    return 'Rainy';
  }
  if (lower.includes('thunder')) {
    return 'Stormy';
  }
  if (lower.includes('snow') || lower.includes('sleet')) {
    return 'Snowy';
  }
  if (
    lower.includes('mist') ||
    lower.includes('fog') ||
    lower.includes('haze') ||
    lower.includes('smoke') ||
    lower.includes('dust') ||
    lower.includes('sand') ||
    lower.includes('ash')
  ) {
    return 'Hazy';
  }
  if (lower.includes('squall') || lower.includes('tornado')) {
    return 'Windy';
  }
  return value;
}

function toIsoDateFromSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }

  try {
    return new Date(seconds * 1000).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}
