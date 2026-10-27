# Fitness goals and manual sleep tracking

Implemented within the existing Django/DRF Fitness module and React Native stack. No new dependencies, global styles, authentication changes, health integration, or calorie-intake tracking were introduced.

## Behavior

- Daily steps/calories-burned goals and weekly workout-session targets support create/update/archive. Archived rows and existing activity remain intact. The existing profile's suggested-step-goal upsert continues working. A conditional unique constraint permits only one active goal per user/metric (the period is fixed by metric).
- Progress is computed by the backend from `FitnessRecord` in the profile timezone; weeks run Monday–Sunday, consistent with the habit/calendar modules. Server progress supplies current, remaining, percentage, and completion. Missing records are unavailable, while recorded zero values remain zero.
- Existing `workout_log` contains exercise rows without completed-session IDs. Workout-session progress therefore explicitly remains unavailable. Exercises and workout days are never counted as sessions. Supplying a genuine completed-session source is a remaining requirement for that metric; existing activity tracking is unchanged.
- Achievement notification receipts are persisted once per goal/local period. Reopening screens or editing an already-achieved target does not generate another receipt for that period. Checks run on Fitness/Goals focus, refresh, and after manual step synchronization, rather than background polling. The POST claim provides at-most-once notification delivery; a client that disconnects after the server records a receipt might miss its alert.
- Manual sleep records use offset-aware bedtime/wake timestamps, persisted as UTC. Real elapsed time accounts for DST and offset changes. The UI shows the device timezone/offset used for entry; summaries assign sessions to wake-up dates in the profile timezone. The API rejects naive/invalid dates, future completed intervals, non-positive durations, and overlaps (including edits).
- Multiple non-overlapping sessions on one wake-up date are combined. The rolling seven-day summary divides by recorded dates only; missing dates have `null` duration, not zero. History is newest-first, paginated at 30 sessions. Saves/deletes update from successful server responses and refresh the summary; failed requests retain error/retry controls.
- All queries and writes are scoped to the authenticated user's external profile UUID. Supplied user IDs cannot override ownership. Per-owner writes serialize overlap checks. Sleep edits/deletes cannot access another user's UUID.
- Legacy duration-only sleep logs in “Log Today” are preserved separately. They cannot be converted into bedtime/wake-up sessions without inventing timestamps. No automatic sleep provider or wearable integration exists; automatic tracking remains unimplemented.

## Changed/added source files

Backend (under `fyp-backend/fitness/`):

- `models.py`: active-goal constraint, sleep records, achievement receipts.
- `serializers.py`: goal progress/target and offset-aware sleep validation.
- `services.py`: local goal periods, actual progress, UTC elapsed duration, seven-day totals.
- `views.py`: owned endpoints, archive-aware upserts, achievement claims, sleep pagination/overlap protection; Fitness activity dates align with the existing user timezone.
- `urls.py`: sleep and achievement routes.
- `migrations/0005_fitnessachievement_sleeprecord_and_more.py`: new tables/indexes/checks; replaces the all-goals uniqueness rule with active-only uniqueness, without removing rows or columns.
- `tests.py`: 20 focused tests including existing Fitness regression coverage.
- `FEATURES.md`: this implementation/verification report.

Frontend (under `fyp-project-app/`):

- `services/fitnessService.ts`: typed goal progress and sleep APIs; omitted activity date now uses the backend's local day.
- `services/fitnessCalculations.ts`: form validation, elapsed duration, overlap detection, date/time merge and formatting.
- `components/fitness/GoalProgress.tsx`: shared progress display using the existing progress bar.
- `components/fitness/achievements.ts`: in-app goal success alert from durable server claims.
- `screens/FitnessGoalsScreen.tsx`: targets, edit/archive, current/remaining/completed states, scrolling and keyboard avoidance.
- `screens/SleepTrackingScreen.tsx`: manual create/edit/confirmed delete, recent record, chronological history, seven-day chart and average, retry states.
- `screens/FitnessScreen.tsx`: entry cards, shared server progress, achievement check, and one focus load instead of duplicate mount/focus loads.
- `navigation/types.ts` and `navigation/AppNavigator.tsx`: Sleep Tracking stack route.
- `tests/fitnessCalculations.test.cjs`: six focused Node tests, run with the bundled Node 24 runtime.

## Migration/setup

Migration 0005 has already been applied to the current local SQLite database and the backend was restarted on port 8080. Before migration, a consistent SQLite backup was saved under `.tools/db-before-fitness-features-20261027-193952.sqlite3`. Complete rows (not just counts) in all five existing Fitness tables matched the backup after migration and smoke checks. Smoke-test writes were rolled back. Pre-existing database/environment edits were not reverted.

For another checkout, use the existing environment and run from `fyp-backend`:

```powershell
.\venv\Scripts\python.exe manage.py migrate
```

Restart Django afterward if running without auto-reload. No new packages are required. Frontend integration was bundled against the running Metro on port 8083; reopening Fitness exposes the Goals and Sleep Tracking cards.

## Verification performed

- `manage.py test fitness --noinput`: 20 tests passed.
- `manage.py test accounts assistant budget community fitness habits medications prayer tasks weather --noinput`: 99 tests passed across the existing app modules.
- Unqualified `manage.py test --noinput`: 99 actual tests passed, but discovery also imported the pre-existing root `test_login.py`, which tries the obsolete live `localhost:8000/auth/login/` endpoint and fails (then hits a Windows console encoding error). This standalone script was not changed.
- Node `--test tests/fitnessCalculations.test.cjs`: six tests passed, including DST, overnight duration, validation, overlap and picker merging.
- Full TypeScript check: the changed Fitness code has no type errors. The command still fails on three existing errors in unchanged `app/(tabs)/_layout.tsx` (incompatible React Navigation/Expo Router template types).
- Full ESLint: blocked by existing repository errors (initial run: 68 errors/28 warnings). Focused lint shows no errors in new Goals/Sleep/components/calculation files. The modified `FitnessScreen.tsx` had seven errors in its HEAD baseline; the existing service and navigator warnings were also reproduced from HEAD. These unrelated lint issues were not suppressed.
- Final baseline comparison across all changed frontend source/test files: zero new lint errors (comparison ignores shifted line numbers inside diagnostic messages).
- `manage.py makemigrations --check --dry-run`: no changes detected after generating/applying 0005. `git diff --check`: passed.
- Authenticated Django API smoke test against the migrated local database: records/today, goals, sleep history, sleep summary, profile, water, routines and auth/me returned 200. Sleep create/read/summary returned 201/200/200; goal creation returned 201 with computed progress. Writes rolled back.
- iOS Metro bundle from port 8083: HTTP 200, with SleepTrackingScreen included. This proves compilation, not execution on an iPhone.
- Browser layout inspection of actual screen components at 320px width: light Goals, dark Sleep, and a reduced 320px viewport height. Missing-input validation and permission-denied/retry states were inspected. The unauthenticated temporary preview made no record writes, used no mock records, and was removed afterward. Screenshots are under `.tools/fitness-goals-320.png`, `.tools/fitness-sleep-dark-320.png`, and `.tools/fitness-goals-short-320.png`.
- Physical iPhone keyboard behavior, native date-picker interaction, populated chart rendering on a device, and end-to-end phone CRUD were not verified. Reduced-height browser checks are not claimed as a native keyboard test. Other modules passed backend regression tests; they were not all manually traversed on a device.
