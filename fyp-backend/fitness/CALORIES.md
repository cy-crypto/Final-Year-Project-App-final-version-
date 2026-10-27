# Personalized walking-calorie estimates and Budget-style Fitness

## Implemented behavior

Fitness now uses the existing Budget visual system through the unchanged shared `ModuleUI` components, `BarChart`, theme colors, fonts, radii, shadows and appearance handling. The Today, Workout, Goals and Trends tabs preserve daily logging, manual phone-step synchronization, water, routine creation/editing/deletion/logging, existing goals, legacy sleep durations and the separate Sleep Tracking screen. Profile and daily-log forms use safe areas, scrolling, keyboard avoidance, shared fields/buttons and server-confirmed save states. Budget source files and global styles were not modified.

The existing authenticated `FitnessProfile` remains the source of truth for height. Nullable weight in kg and whole-number age were added there; account fields were inspected and contain no suitable duplicate measurements. Supported form/API ranges are 25–350 kg, 100–250 cm and 18–120 years. Incomplete measurements are allowed so other Fitness/app features continue working. Age is stored and used to constrain the supported adult population; it has no term in the calorie equation. The existing optional gender and suggested-step-goal behavior remain available; gender is not used by the calorie estimator.

The account currently has temperature preferences, but no existing weight/height unit preference. Fitness therefore persists its own `display_units` preference (`metric`/`imperial`) while always storing canonical kg/cm. Imperial inputs convert with 1 lb = 0.45359237 kg and 1 in = 2.54 cm. Canonical precision is 0.01 kg and 0.1 cm. Form toggles, saved values and unsaved/success/error states are explicit. An obvious Edit fitness profile card sits directly below the summary; incomplete profiles get a setup action instead.

## Formula, sources and assumptions

The [Compendium of Physical Activities' unit conversions and ACSM equations](https://pacompendium.com/unite-conversions/) give the horizontal walking cost as 0.1 mL O₂ per kg per meter, and approximately 5 kcal per liter of oxygen. The published walking equation contains a separate resting component of 3.5 mL/kg/min. This implementation excludes that resting component. Multiplying horizontal oxygen cost by distance, body mass and the oxygen energy equivalent gives:

```text
estimated step length (m) = height_cm × 0.414 / 100
estimated distance (m)    = recorded daily steps × estimated step length
estimated active kcal    = distance_m × weight_kg × 0.0005
                         = distance_km × weight_kg × 0.5
```

For the height heuristic, [Non-GNSS Smartphone Pedestrian Navigation Using Barometric Elevation and Digital Map-Matching, equation 11](https://pmc.ncbi.nlm.nih.gov/articles/PMC6068906/) describes height multipliers of 0.413 and 0.415. **The sex-neutral midpoint 0.414 is this app's explicit approximation**, not a published universally validated coefficient and not an inference of biological sex. It estimates one step's length, not a two-step stride. The legacy `estimated_stride_cm` API name is retained for compatibility but the form labels it step length.

No walking speed, duration or measured incline is invented. Speed multiplied by duration cancels to distance in the horizontal component. Level-ground walking is an explicit model assumption; actual terrain is not detected. The ACSM walking equation's normal walking-speed domain cannot be verified from a cumulative step counter. The result is an approximation of walking energy above rest, not measured energy or total daily expenditure. Running, stairs, hills, carried loads, unusually slow/fast walking, variable step length, individual gait and age-related economy can differ substantially. The model cannot distinguish these activities from daily steps, and these measurements alone cannot eliminate that uncertainty.

Independent reference examples used in tests:

- 10,000 steps, 170 cm, 70 kg → 7,038 m → **246.33 kcal**.
- 8,000 steps, 180 cm, 80 kg → 5,961.6 m → **238.46 kcal** after rounding.

Calculation code is isolated in `fitness/calories.py`, with Decimal arithmetic and version `acsm-horizontal-height-0414-v1`. No BMR or intake functionality was added.

## Step data, history and source precedence

- The existing pedometer service is unchanged. Its phone reading remains an informational snapshot until the user chooses Sync to log. Calories then derive automatically from the canonical saved daily total. Manual daily step entry works independently of sensor availability.
- A cumulative reading replaces the day's total. Calories are recomputed from that total, never incremented by repeated API responses, restarts or repeated sensor readings. Snapshot time/date/source are recorded. Older sensor snapshots, future snapshots beyond a 30-second clock-skew tolerance, and snapshots belonging to a different local day are rejected.
- Unknown tracking is distinct from a recorded zero. An untouched default zero is unavailable. Explicitly logging/syncing zero produces a known zero and a zero estimate when the measurements are complete. Positive legacy step totals are recognized as recorded data; legacy zero rows without provenance conservatively remain unknown.
- Fitness activity dates use the existing authenticated profile timezone helper. The Today form includes a server-checked `today_only` flag so a form left open across midnight cannot silently overwrite a completed day. The interface clears old phone snapshots on foreground/day changes and labels saved values and snapshot times instead of claiming live tracking.
- Current-day estimates refresh after relevant profile edits or canonical step changes. Estimate/version metadata contains steps, weight, height, ratio, distance, local date/timezone, activity assumption, resting-energy exclusion and calculation time. Repeated reads with unchanged inputs do not rewrite the calculation snapshot.
- Closed historical estimates are not recalculated with today's measurements. Legacy historical records without estimates are not backfilled using guessed historic measurements. Existing manual data and the original `calories_burned` column are preserved.
- There is no wearable/workout calorie provider. Existing workout logs contain exercises, not energy measurements. Existing manually entered calories are an explicit **override**, including a newly recorded manual zero. Overrides take precedence for calorie-goal progress; they are never added to walking estimates. The Today card explains the override, and Log Today can edit it or clear it to return goal progress to the estimate. One calorie summary is used, with the original manual value explained only when it overrides goal progress.
- Existing calorie goals use the effective source, without a second goal system. Missing inputs produce an unavailable state, and existing persistent achievement receipts continue preventing duplicate target notifications.
- The assistant's existing Fitness read/write tools were the only other canonical activity writer found. Their Fitness-specific paths now share activity validation/save logic, record known-zero/source metadata, and use the same user-local activity day. Original arguments/return keys remain available and additional source/estimate fields clarify the result. Other assistant tools and the water tool's existing day convention were not changed.

## Ownership, persistence and migration

Production authentication is unchanged. Every Fitness endpoint scopes records/profiles to the authenticated account's external profile UUID; client-supplied user IDs cannot select another owner. Estimate and provenance fields are server controlled. Profile/activity writes hold the same per-owner database lock. Partial profile updates re-read under that lock, preventing a stale water-only PATCH from restoring old measurements.

Additive migration `0006_fitnessprofile_age_fitnessprofile_display_units_and_more.py` adds three profile fields and six activity/estimate fields. It removes no rows/columns and does not rewrite historic measurements or activity. It has already been applied to the current local database, and the backend is restarted on port 8080. No new dependencies are needed; Metro remains on port 8083.

A consistent pre-migration SQLite backup is at `.tools/db-before-calorie-estimates-20261027-202554.sqlite3`. All original columns and rows across the seven existing Fitness tables matched that backup after the migration and rollback-only smoke test. Six Budget-named source files were also checked against pre-change SHA-256 hashes and were unchanged. Existing unrelated working-tree/environment changes were preserved.

For another checkout, run from `fyp-backend` and then restart Django:

```powershell
.\venv\Scripts\python.exe manage.py migrate
```

## Files changed for this request

Backend:

- `fyp-backend/fitness/models.py`
- `fyp-backend/fitness/calories.py` (new, pure formula and versioned snapshots)
- `fyp-backend/fitness/activity.py` (new, shared cumulative activity writes)
- `fyp-backend/fitness/serializers.py`
- `fyp-backend/fitness/views.py`
- `fyp-backend/fitness/services.py` (existing goal integration)
- `fyp-backend/fitness/test_calories.py` (new, 20 tests)
- `fyp-backend/fitness/tests.py` (updates the prior default-zero assertion to the new explicit availability semantics)
- `fyp-backend/fitness/migrations/0006_fitnessprofile_age_fitnessprofile_display_units_and_more.py` (new)
- `fyp-backend/assistant/tools.py` (Fitness-specific integration only)
- `fyp-backend/fitness/CALORIES.md` (this report)
- `fyp-backend/db.sqlite3` (local migration; original Fitness data verified unchanged)

Frontend:

- `fyp-project-app/screens/FitnessScreen.tsx`
- `fyp-project-app/screens/FitnessProfileScreen.tsx`
- `fyp-project-app/screens/LogFitnessScreen.tsx`
- `fyp-project-app/services/fitnessService.ts`
- `fyp-project-app/services/fitnessCalculations.ts`
- `fyp-project-app/tests/fitnessCalculations.test.cjs`

The previous goals/sleep work remains intact. No Budget, navigation, theme, shared-component, pedometer-service, package or lockfile changes were required for this request. Temporary preview entry/HTML files were removed after verification. Test scripts, isolated test database, screenshots, backups and check artifacts remain under ignored `.tools/`; the temporary QA token was invalidated and the QA server stopped.

## Checks actually performed

- `manage.py test accounts assistant budget community fitness habits medications prayer tasks weather --noinput`: **119 tests passed**, including 40 Fitness tests (20 new calorie/profile/source tests and 20 prior goals/sleep/regression tests).
- Node 24 `--test tests/fitnessCalculations.test.cjs`: **9 tests passed**, including kg/lb and cm/in conversion, range validation and local-day handling alongside the earlier six tests.
- Tests cover independent formula examples, missing profile/steps, known zero, repeated cumulative readings/restarted clients, stale/future/naive snapshots, midnight and DST, unchanged history after profile edits, manual override precedence, existing calorie-goal/achievement integration, stale partial-profile writes, the assistant writer, spoofed ownership and unauthorized/cross-user access.
- Focused ESLint on changed Fitness screens/services/calculation helpers/test file: **0 errors**, with the same existing Axios import warning in `fitnessService.ts`.
- Full ESLint was run: **58 errors, 26 warnings** remain elsewhere in the repository. These unrelated existing issues were not suppressed or changed.
- `tsc --noEmit` was run: only the **three existing errors** in unchanged `app/(tabs)/_layout.tsx` remain (Expo Router/React Navigation template types). No Fitness type errors were reported; the overall command still fails.
- Django system check: passed. Migration drift check (`makemigrations --check --dry-run`): no changes detected. `git diff --check`: passed.
- API smoke against the migrated local database: authenticated profile PATCH and activity/goal POSTs produced the independent expected **246.33 kcal**; existing Fitness endpoints returned 200. All smoke writes rolled back. This used Django's authenticated API test client, not a new real Supabase login.
- Final iOS Metro bundle on port 8083: **HTTP 200**, new Fitness summary included. Backend LAN root on port 8080: HTTP 200; Metro status: running. Compilation does not establish execution on a physical iPhone.
- Actual screen components were inspected in a **320px browser preview**, in light/dark modes and a 320px reduced-height viewport. The temporary preview used real REST endpoints, an isolated local SQLite fixture database and a local test account; no test measurements were written to the user's database or shipped as app data.
- Through that UI, changing the fixture's weight from 70 to 80 kg saved successfully, refreshed the estimate from 246.33 to **281.52 kcal**, and showed the existing 300 kcal goal with **18.48 kcal remaining**. Saving imperial display units preserved canonical **80 kg / 170 cm / 25 years** in the isolated database. An out-of-range age was rejected and remained unsaved after reloading. Narrow-screen clipped labels found during inspection were shortened.
- Browser layout evidence: `.tools/calorie-dashboard-320.png`, `.tools/calorie-profile-dark-320.png`, `.tools/calorie-profile-dark-short.png`.

## Remaining verification limits

No physical iPhone/Android sensor, native software-keyboard, or native permission-prompt test was performed. The desktop browser's focused inputs and reduced-height scrolling are not claimed as a native keyboard check. Production Supabase sign-in was not newly exercised; its configuration and authentication implementation were not changed. The walking/step-length assumptions cannot be validated from the available cumulative step data. Existing automatic sleep and completed-workout-session limitations described in `FEATURES.md` are unchanged.
