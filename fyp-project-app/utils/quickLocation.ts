import * as Location from 'expo-location';

/**
 * The phone's position without the usual GPS wait: a recent last-known fix (under 10 minutes old,
 * within ~1 km) is returned instantly; only when there is none do we wait for a fresh GPS fix.
 * Good enough for weather and prayer times; the Qibla compass still asks for a fresh fix itself.
 */
export async function getQuickPosition() {
  const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000, requiredAccuracy: 1000 }).catch(() => null);
  if (last) return last;
  return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
}
