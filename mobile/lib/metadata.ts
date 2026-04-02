import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import SunCalc from 'suncalc';

export type MemoMetadata = {
  capturedAt: string;
  location: {
    latitude: number;
    longitude: number;
    placeName: string | null;
  } | null;
  weather: {
    conditions: string;
    temperature: number;
    temperatureUnit: string;
  } | null;
  pressure: {
    hPa: number;
    trend: 'rising' | 'steady' | 'falling';
  } | null;
  dayPeriod: 'morning' | 'afternoon' | 'evening' | 'night';
  daylight: {
    sunrise: string;
    sunset: string;
    hoursOfLight: number;
  } | null;
  steps: number | null;
};

function getDayPeriod(hour: number): MemoMetadata['dayPeriod'] {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

async function captureLocation(): Promise<MemoMetadata['location']> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    let placeName: string | null = null;
    try {
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (geo) {
        const parts = [geo.district || geo.subregion, geo.city].filter(Boolean);
        placeName = parts.join(', ') || geo.name || null;
      }
    } catch {
      // reverse geocoding can fail silently
    }

    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      placeName,
    };
  } catch {
    return null;
  }
}

function captureDaylight(
  latitude: number,
  longitude: number,
  date: Date,
): MemoMetadata['daylight'] {
  try {
    const times = SunCalc.getTimes(date, latitude, longitude);
    const sunrise = times.sunrise;
    const sunset = times.sunset;
    const hoursOfLight =
      (sunset.getTime() - sunrise.getTime()) / (1000 * 60 * 60);

    return {
      sunrise: formatTime(sunrise),
      sunset: formatTime(sunset),
      hoursOfLight: Math.round(hoursOfLight * 100) / 100,
    };
  } catch {
    return null;
  }
}

async function captureSteps(): Promise<number | null> {
  try {
    const available = await Pedometer.isAvailableAsync();
    if (!available) return null;

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const result = await Pedometer.getStepCountAsync(startOfDay, now);
    return result.steps;
  } catch {
    return null;
  }
}

// Weather via OpenWeatherMap — disabled until API key is configured
// For now returns null; Phase 2 will add settings for the API key
async function captureWeather(
  _latitude: number,
  _longitude: number,
): Promise<{ weather: MemoMetadata['weather']; pressure: MemoMetadata['pressure'] }> {
  // TODO: implement with OpenWeatherMap API key from settings
  return { weather: null, pressure: null };
}

/**
 * Capture all available metadata in a single burst.
 * Called when the user stops recording.
 */
export async function captureMetadata(): Promise<MemoMetadata> {
  const now = new Date();

  // Run location and steps in parallel
  const [location, steps] = await Promise.all([
    captureLocation(),
    captureSteps(),
  ]);

  // Daylight needs coordinates
  let daylight: MemoMetadata['daylight'] = null;
  let weather: MemoMetadata['weather'] = null;
  let pressure: MemoMetadata['pressure'] = null;

  if (location) {
    daylight = captureDaylight(location.latitude, location.longitude, now);
    const weatherData = await captureWeather(location.latitude, location.longitude);
    weather = weatherData.weather;
    pressure = weatherData.pressure;
  }

  return {
    capturedAt: now.toISOString(),
    location,
    weather,
    pressure,
    dayPeriod: getDayPeriod(now.getHours()),
    daylight,
    steps,
  };
}
