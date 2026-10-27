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

## Notes

- **Any Expo account can open the app.** `npm start` runs `expo start --offline`, which serves the project without signing it to the logged-in Expo account, so teammates with their own (or no) Expo account can scan the QR code.
- **Backend URL is automatic.** The app calls port `8080` on the computer that runs `npm start`. To use a different backend, create `fyp-project-app/.env.local` with `EXPO_PUBLIC_BACKEND_URL=http://<ip>:8080`.
- If the phone cannot connect, allow ports 8080 and 8081 through the computer's firewall.
- Adding a package: frontend `npx expo install <pkg>` then commit `package.json` + `package-lock.json`; backend `pip install <pkg>` inside the venv, then `pip freeze > requirements.txt` and commit it.
