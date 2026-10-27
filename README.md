# Final-Year-Project-App

Expo (React Native) mobile app in `fyp-project-app/` + Django REST backend in `fyp-backend/`.

## Required versions

Everyone must use the same tool versions so installs are identical:

| Tool | Version | Pinned in |
|------|---------|-----------|
| Node.js | 24.14.0 | `fyp-project-app/.nvmrc`, `package.json` engines |
| npm | 11+ (ships with Node 24) | `package.json` engines |
| Python | 3.14.3 | `fyp-backend/.python-version` |
| Expo SDK | 58 | `fyp-project-app/package-lock.json` |
| Expo Go (phone) | latest from App Store / Play Store (must support SDK 58) | |

Exact package versions are locked by `fyp-project-app/package-lock.json` and `fyp-backend/requirements.txt`. Do not delete the lock file.

## First-time setup (after `git clone` / `git pull`)

### Backend

Windows (cmd):
```cmd
cd fyp-backend
setup.bat
```

macOS / Linux:
```bash
cd fyp-backend
./setup.sh
```

This creates a `venv`, installs the pinned packages, creates `.env` from `.env.example` and runs migrations.
Ask a teammate for real values (e.g. `OPENWEATHER_API_KEY`) and put them in `fyp-backend/.env` - never commit `.env`.

### Frontend

```cmd
cd fyp-project-app
npm ci
```

Use `npm ci` (not `npm install`) so you get exactly the versions in `package-lock.json`.

## Running (two terminals)

Terminal 1 - backend:
```cmd
cd fyp-backend
start_server.bat        (macOS/Linux: ./start_server.sh)
```
Manual equivalent: `venv\Scripts\activate` then `python manage.py runserver 0.0.0.0:8080`.

Terminal 2 - frontend:
```cmd
cd fyp-project-app
npm start
```
Scan the QR code with Expo Go (phone on the same Wi-Fi as the computer). Add `--clear` (`npm start -- --clear`) after pulling dependency changes.

## Deploying on Render (free)

`render.yaml` creates two free Render services: `personal-companion-backend` (Django) and `personal-companion-app` (the web version of the Expo app). The database is the Supabase Postgres of the project used for login. Secrets are uploaded as Render **Secret Files**, not committed.

1. Supabase dashboard > **Connect** > copy the **Session pooler** URI (the direct `db.<ref>.supabase.co` host is IPv6 only and Render can't reach it) and fill in the database password.
2. Supabase > Project Settings > **Data API**: remove `public` from the exposed schemas. Django's tables live there and the app only uses Supabase for login; otherwise the public anon key could read them.
3. Render dashboard > **New > Blueprint** > pick this repository and branch. Render reads `render.yaml` and creates both services (the first builds fail until step 4 is done).
4. Upload the Secret Files (service > **Environment** > **Secret Files**), then **Manual Deploy**:
   - backend: `.env` (a copy of `fyp-backend/.env` with `DATABASE_URL` set to the URI from step 1). `DEBUG=False` and `SECRET_KEY` come from Render and override the file.
   - app: `.env.local` and `.env.development` (copies of the app's files with `EXPO_PUBLIC_BACKEND_URL=https://<backend>.onrender.com` and `EXPO_PUBLIC_AUTH_BYPASS=1` while login is disabled).
5. For the phone app, put the same `EXPO_PUBLIC_BACKEND_URL` in your local `fyp-project-app/.env.local` and restart with `npm start -- --clear`.

Login is disabled for now: `DEV_AUTH_BYPASS=True` in `render.yaml` makes requests without a token use one shared demo user, so anyone with the URL sees the same demo data. Set it to `False` and remove `EXPO_PUBLIC_AUTH_BYPASS` (app `.env.local` and `eas.json`) to require Supabase sign-in.

Free-plan limits: the backend sleeps after 15 minutes without traffic (the next request takes about a minute), and uploaded files (avatars, post images, task attachments) are wiped on every deploy or restart. On the web version, notifications, the Qibla compass and some native pickers are unavailable.

## Android and iOS builds (EAS)

`fyp-project-app/eas.json` points every build at the Render backend with login disabled. From `fyp-project-app`:

```cmd
npx eas-cli login
npx eas-cli build -p android --profile preview     (installable .apk)
npx eas-cli build -p ios --profile preview         (iPhone; needs a paid Apple Developer account)
npx eas-cli build -p ios --profile simulator       (iOS Simulator on a Mac; no Apple account)
```

The Supabase URL and anon key come from EAS environment variables (`npx eas-cli env:create`), because `.env.local` is not uploaded.

## Notes

- **Any Expo account can open the app.** `npm start` runs `expo start --offline`, which serves the project without signing it to the logged-in Expo account, so teammates with their own (or no) Expo account can scan the QR code.
- **Backend URL is automatic.** The app calls port `8080` on the computer that runs `npm start`. To use a different backend, create `fyp-project-app/.env.local` with `EXPO_PUBLIC_BACKEND_URL=http://<ip>:8080`.
- If the phone cannot connect, allow ports 8080 and 8081 through the computer's firewall.
- Adding a package: frontend `npx expo install <pkg>` then commit `package.json` + `package-lock.json`; backend `pip install <pkg>` inside the venv, then `pip freeze > requirements.txt` and commit it.
