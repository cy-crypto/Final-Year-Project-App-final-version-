import { Pedometer } from 'expo-sensors';

// --- Manual-sync design decision ---
// Device step counting here is deliberately NOT automatic. We fetch and display the
// phone's step count as a separate, informational number ("steps detected by your phone
// today") and require an explicit user tap ("Sync to log") before it ever touches the
// user's actual logged fitness record. Do not "fix" this into a silent background sync:
// - Manual entry is the primary, authoritative source for today's steps in this app —
//   pedometer hardware/OS behavior is not reliable enough to trust as an unattended source
//   of truth. In particular, getTodayStepCount() below is expected to return null on most
//   Android devices on this expo-sensors version (see its comment) — iOS is the platform
//   where this feature is actually expected to produce a usable count today.
// - Silently overwriting a value the user typed in themselves would be a surprising and
//   potentially frustrating data loss, not a convenience.
// - No background task registration or periodic sync is implemented in this pass, and none
//   should be added without deliberately revisiting this decision (and the background
//   permission/battery implications that come with it).
// See screens/FitnessScreen.tsx for the confirm-before-overwrite UI this feeds into.

export async function isAvailable(): Promise<boolean> {
  try {
    return await Pedometer.isAvailableAsync();
  } catch {
    // Some devices/platforms (and the iOS Simulator / Android Emulator, which have no
    // pedometer hardware at all) genuinely don't support this — treat any failure here as
    // "not available" rather than letting it throw and break the caller's UI.
    return false;
  }
}

export async function requestPermission(): Promise<boolean> {
  // Pedometer.requestPermissionsAsync() covers both platforms' step-counting permission:
  // iOS prompts for Motion & Fitness access (NSMotionUsageDescription in Info.plist), and
  // Android prompts for the ACTIVITY_RECOGNITION runtime permission (API 29+; declared in
  // app.json's android.permissions). Either way we just want a plain granted/not-granted.
  try {
    const { status } = await Pedometer.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function getTodayStepCount(): Promise<number | null> {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const result = await Pedometer.getStepCountAsync(startOfToday, now);
    // iOS (CMPedometer-backed) is generally reliable for this kind of historical range
    // query. Android is a different story: as of this expo-sensors version, the native
    // Android module unconditionally throws "not supported" for getStepCountAsync (it only
    // implements the live step-counter sensor, not date-range queries) — so on Android this
    // will consistently land in the catch block below, not intermittently. The try/catch
    // and the null return already handle that; this isn't a bug to "fix" by retrying.
    // Treat anything that isn't a real, non-negative number as "no usable count" too,
    // rather than letting a garbage value reach the UI.
    if (!result || typeof result.steps !== 'number' || Number.isNaN(result.steps) || result.steps < 0) {
      return null;
    }
    return result.steps;
  } catch {
    return null;
  }
}
