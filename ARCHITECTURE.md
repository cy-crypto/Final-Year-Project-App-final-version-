# Application Architecture

## Project Structure

```
Final-Year-Project-App-final-version-/
├── fyp-backend/              # Django REST API server
│   ├── config/               # Django settings & URL routing
│   ├── accounts/             # User auth, profiles, password reset
│   ├── weather/              # Weather API, caching, adapter
│   ├── habits/               # Habit tracking (existing)
│   ├── tasks/                # Task management (existing)
│   ├── manage.py
│   ├── requirements.txt
│   └── db.sqlite3            # SQLite (or Postgres via Supabase)
│
└── fyp-project-app/          # React Native (Expo) mobile app
    ├── app/                  # App routing structure
    ├── screens/              # Screen components
    ├── components/           # Reusable UI components
    ├── services/             # API clients & business logic
    ├── context/              # Auth & App global state
    ├── navigation/           # Navigation configuration
    ├── constants/            # Theme, colors
    ├── assets/               # Images, fonts
    ├── package.json
    └── app.json              # Expo configuration
```

---

## Backend Architecture

### 1. Django Application Structure

#### Config (config/)
- **settings.py**: Centralized configuration
  - Database (SQLite or Supabase Postgres)
  - Installed apps (accounts, weather, habits, tasks)
  - DRF & CORS settings
  - Email backend configuration (SMTP via env vars)
  - REST Framework auth: TokenAuthentication
  
- **urls.py**: Main URL router
  - Routes to `/api/auth/`, `/api/weather/`, `/api/habits/`, `/api/tasks/`

#### Accounts App (accounts/)

**Models**
- `User` (Django built-in): username, email, password
- `UserProfile`: Extends User
  - Fields: external_user_id (UUID), full_name, avatar_image, bio, selected_city
  - Social auth fields: email_confirmed, social_provider, social_subject (for future OAuth)
- `ConfirmationCode`: Password reset codes
  - Fields: email, code (6 digits), created_at, expires_at, used
  - Auto-cleanup via migration (10-min TTL)

**Serializers**
- `SignupSerializer`: email, password, full_name (optional)
- `LoginSerializer`: email, password
- `ProfileSerializer`: editable user profile fields
- `ForgotPasswordSerializer`: email validation
- `ResetPasswordSerializer`: email, code, new_password validation

**Views**
- `SignupView` (POST): Creates user + profile, returns token
- `LoginView` (POST): Authenticates, returns token
- `MeView` (GET): Current authenticated user info
- `ProfileView` (GET/PATCH): User profile CRUD
- `LogoutView` (POST): Token invalidation (optional)
- `ForgotPasswordView` (POST): Generates & emails reset code (no auth required)
- `ResetPasswordView` (POST): Validates code & resets password (no auth required)

**Email Flow**
- Uses Django's `send_mail()` with SMTP settings from env vars
- EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD, EMAIL_USE_TLS
- DEFAULT_FROM_EMAIL sets sender

#### Weather App (weather/)

**Models**
- `SavedLocation`: User-saved cities
  - Fields: user_id (UUID), city, created_at
  - Unique constraint: (user_id, city)
  
- `WeatherCache`: DB-backed cache for API responses
  - Fields: city_key (unique), city_name, payload (JSON), fetched_at (indexed)
  - TTL: 30 min (checked on fetch)
  - Ordering: -fetched_at (newest first)

**Services** (weather/services.py)

`WeatherAdapter` class:
- **Constructor**: Takes api_key, cache_ttl (default 1800s)
- **get_by_city(city: str) → dict**:
  1. Check DB cache (within TTL)
  2. If hit, return cached payload
  3. Otherwise, fetch via _fetch_one_call()
  4. Cache result, return payload
  
- **_fetch_one_call(city) → dict**:
  1. Geocode city → lat/lon via /geo/1.0/direct (OpenWeather free)
  2. Fetch current weather: /data/2.5/weather?q=city (free plan, 3-hour forecast)
  3. Fetch 3-hour forecast: /data/2.5/forecast?q=city
  4. Parse into structured format:
     - **current**: temp, feels_like, humidity, wind_speed, sunrise, sunset, weather
     - **hourly**: first 12 3-hour blocks (dt, temp, pop, humidity, weather)
     - **daily**: aggregate by date, derive min/max/pop/humidity from forecast

- **geocode_city(city) → dict**:
  - Returns name, lat, lon, country (used for health checks)

- **Error Handling**: `WeatherAdapterError` exception with status codes
  - 401: Invalid API key
  - 404: City not found
  - 502: Network/parsing error

**Response Payload** (returned to frontend):
```json
{
  "city": "London",
  "lat": 51.5085, "lon": -0.1257,
  "timezone_offset": 3600,
  "current": {
    "temp": 15.2, "feels_like": 14.8, "humidity": 72,
    "wind_speed": 3.5, "wind_deg": 270,
    "sunrise": 1715123400, "sunset": 1715177400,
    "temp_min": 13.1, "temp_max": 16.8,
    "weather": [{"main": "Cloudy", "description": "overcast clouds"}]
  },
  "hourly": [
    {"dt": 1715124000, "temp": 15.1, "pop": 0.2, "humidity": 73, 
     "weather": [{"main": "Cloudy"}]}, ...
  ],
  "daily": [
    {"date": "2025-05-08", "temp_min": 13.1, "temp_max": 16.8, 
     "pop": 0.3, "humidity": 75, "sunrise": 1715..., "sunset": 1715..., ...}, ...
  ]
}
```

**Views**
- `WeatherByCityView` (GET /weather/?city=):
  - Uses WeatherAdapter to fetch cached or fresh weather
  - Returns structured response
  
- `WeatherHealthView` (GET /weather/health/):
  - Tests API key by geocoding "London"
  - Returns {ok: true/false, detail, coords}
  
- `SavedLocationViewSet` (CRUD /weather/locations/):
  - List: Returns user's saved locations
  - Create: Adds location for user (handles duplicates via IntegrityError → 409)
  - Delete: Removes location

#### Habits & Tasks Apps
- Existing functionality (CRUD endpoints)
- Not modified in this update

### 2. Database Schema

**SQLite (Development)**
- Simple file-based DB
- Sufficient for single-user testing

**Postgres (Supabase, Production)**
- Connection via psycopg[binary]
- Credentials from env vars: SUPABASE_DB_*

**Key Tables**
- `auth_user` (Django): username, email, password_hash, etc.
- `accounts_userprofile`: external_user_id, full_name, avatar_image, bio, selected_city, social_* fields
- `accounts_confirmationcode`: email, code, created_at, expires_at, used
- `weather_savedlocation`: user_id, city, created_at
- `weather_weathercache`: city_key, city_name, payload (JSON), fetched_at
- `habits_habit`, `tasks_task`: Existing habit/task tables

### 3. API Endpoints

**Auth**
```
POST   /api/auth/signup/              → {email, password, full_name?} → {token, user, ...}
POST   /api/auth/login/               → {email, password} → {token, user, ...}
POST   /api/auth/logout/              → {} → {detail}
GET    /api/auth/me/                  → {} → {email, profile, ...}
GET    /api/auth/profile/             → {} → {user_profile}
PATCH  /api/auth/profile/             → {updates} → {user_profile}
POST   /api/auth/password/forgot/     → {email} → {detail: "If account exists, code sent"}
POST   /api/auth/password/reset/      → {email, code, new_password} → {detail}
```

**Weather**
```
GET    /api/weather/?city=London      → {city, current, hourly, daily, ...}
GET    /api/weather/health/           → {ok, detail, coords}
GET    /api/weather/locations/        → [{id, city, created_at}, ...]
POST   /api/weather/locations/        → {city} → {id, city, ...}
DELETE /api/weather/locations/{id}/   → {} → {detail}
```

---

## Frontend Architecture

### 1. State Management

**Global Contexts**

- **AuthContext** (context/AuthContext.tsx)
  - State: `isAuthenticated`, `user` (AuthUser), `loading`, `loginError`
  - User fields: email, token, fullName, avatar_url, selectedCity, external_user_id
  - Methods:
    - `login(email, password)` → {ok, error?}
    - `signup(email, password, fullName?)` → {ok, error?}
    - `logout()` → void
    - `updateProfile({fullName, bio, selectedCity, avatar_url?})` → void
    - `verifyCode(email, code)` → {ok, error?}
    - `resendCode(email)` → {ok, error?}
  - Persists token to AsyncStorage on login
  - Restores from AsyncStorage on app start (via useEffect)

- **AppContext** (context/AppContext.tsx)
  - State: `weather` (WeatherSnapshot | null), `tasks`, `habits`, `selectedCity`
  - Methods: `setWeather()`, `addTask()`, `updateTask()`, etc.
  - Syncs selectedCity with backend profile

### 2. Service Layer

**authService.ts**
- `signup(email, password, fullName?)` → POST /auth/signup/
- `login(email, password)` → POST /auth/login/
- `updateProfile(input)` → PATCH /auth/profile/
- `requestPasswordReset(email)` → POST /auth/password/forgot/
- `resetPassword(email, code, newPassword)` → POST /auth/password/reset/

**weatherService.ts**
- `fetchWeatherByCity(city: string)` → GET /weather/?city=
  - Returns WeatherSnapshot (city, temp, condition, min/max, humidity, hourly, daily, updatedAt)
  - Normalizes condition strings
  - Calculates min/max from daily forecast

**api.ts**
- Central axios instance with:
  - Base URL: http://127.0.0.1:8000/api (dev) / from app.json extra (prod)
  - Token auth header (if logged in)
  - Error handling with `toApiErrorMessage()`
  - JSON parsing with `parseJsonData<T>()`

### 3. Screen Components

**LoginScreen**
- Email/password form
- "Forgot Password" button → opens modal
  - Step 1: Send code (email input, "Send Code" button)
  - Step 2: Enter code + new password
  - Step 3: "Reset Password" submits
- Google/Apple OAuth placeholders (coming soon)
- Link to Signup

**SignupScreen**
- Full name (optional), email, password, confirm password
- "Create account" button
- Google/Apple OAuth placeholders
- Link to Login

**ConfirmCodeScreen** (future: email verification)
- Email display (from route params)
- Code input (6 digits)
- Timer (expires_at countdown)
- "Verify" + "Resend code" buttons

**WeatherScreen** (Major redesign)
- **Hero Section** (top):
  - City name (large, bold)
  - Weather emoji (size 72)
  - Current temp (56px bold)
  - Condition + High/Low + Summary text
  - Wind speed + Humidity
  
- **ImageBackground**: Condition-based Wikipedia image
  - Cache-busting via updatedAt query param
  - Overlay for readability

- **Stale Banner**: Shows if serving AsyncStorage cache
  - Displays cache timestamp

- **Hourly Forecast** (horizontal scroll):
  - Cards: time, emoji, temp, precipitation%
  - 12 items max

- **Daily Forecast** (vertical list):
  - Rows: date, emoji, high/low, precipitation%
  - 5 days max

- **Location Picker** (bottom sheet modal):
  - Search by city input
  - "Use Device Location" button
  - "Save This City" button
  - List of saved locations (tap to load)

- **Bottom Button**: "Change Location" → opens picker

- **Data Flow**:
  1. Mount: Load cached weather from AsyncStorage
  2. Request location permission (if allowDeviceLocation)
  3. If allowed: Fetch by device location
  4. Else if selectedCity: Fetch by selected city
  5. Else: Fetch default (London)
  6. Cache result in AsyncStorage + DB

**HomeScreen**
- Hero card with tasks/habits/weather KPIs
- Weather snapshot with emoji + rounded temp
- Today's tasks (top 3)
- Habit completion %
- Current weather detail (emoji + condition + city)
- Auto-fetches weather on mount (10-min dedup)

### 4. Components

**ScreenContainer**
- Wrapper for all screens
- Props: title, subtitle, hideHeader?, safeAreaStyle?, contentContainerStyle?
- Renders SafeAreaView → ScrollView → header (if !hideHeader) + children

**WeatherEmoji Helpers**
- `resolveWeatherEmoji(condition?, isNight?)` → emoji string
- `isNightNow(snapshot?)` → bool (hour < 6 or >= 19, respects timezone)
- `isNightForTimestamp(dt?, snapshot?)` → bool (uses sunrise/sunset or hour-based)

**Time Formatting**
- `formatHour(timestamp?, timezoneOffset?)` → "3 PM"
- `formatDay(dateText?, dtSeconds?, index?)` → "Mon"
- `formatCachedTime(isoText?)` → "3:45 PM"

### 5. Navigation

**AppNavigator** (React Navigation)
- Stack navigator with tab-based auth routing
- **Unauthenticated**:
  - Login → Signup → Confirm
- **Authenticated**:
  - MainTabs (Home, Habits, Tasks, Weather, Profile)
  - AddTask modal

---

## Data Flow Diagrams

### Weather Loading (First Time)
```
App Mounts
  ↓
Check AsyncStorage for preference: allowDeviceLocation
  ↓
If allowDeviceLocation:
  ├→ Request location permission
  │   ├→ Granted: getCurrentPosition() → fetchWeatherByCity()
  │   └→ Denied: Show banner, fall back to selectedCity or London
  └→ Fetch weather
      ↓
      Check DB cache
        ├→ Hit (< 30min): Return cached
        └→ Miss: OpenWeather API
            ├→ Geocode city → Fetch /data/2.5/weather + /forecast
            ├→ Parse → Store in DB cache
            └→ Return
      ↓
      Store in AsyncStorage (for offline)
      ↓
      Update App context (trigger UI re-render)
```

### Password Reset Flow
```
User taps "Forgot Password"
  ↓
Modal opens, email pre-filled
  ↓
User taps "Send Code"
  ├→ POST /auth/password/forgot/ {email}
  └→ Backend:
      ├→ Check if user exists (silent if not)
      ├→ Generate code (ConfirmationCode)
      ├→ Send email via SMTP
      └→ Return {detail: "If account exists..."}
  ↓
Modal shows code input + new password input
  ↓
User enters code + password, taps "Reset Password"
  ├→ POST /auth/password/reset/ {email, code, new_password}
  └→ Backend:
      ├→ Find non-expired, unused code
      ├→ Update user.password
      ├→ Mark code as used
      └→ Return {detail: "Password reset successful"}
  ↓
Frontend: Show success alert, navigate to Login
```

### Login with Full Profile Sync
```
User enters email + password, taps "Login"
  ├→ POST /auth/login/ {email, password}
  └→ Backend: Authenticate, return {token, user, profile}
  ↓
Frontend:
  ├→ Store token in AsyncStorage
  ├→ Update AuthContext with user data
  ├→ Restore saved locations via GET /weather/locations/
  ├→ Trigger weather fetch for selectedCity (if present)
  └→ Navigate to MainTabs (Home)
```

---

## Configuration & Deployment

### Environment Variables (Backend)

**Essential**
- DJANGO_SECRET_KEY: Django app secret
- OPENWEATHER_API_KEY: Free tier key
- DJANGO_ALLOWED_HOSTS: CORS origins

**Database**
- Database: sqlite3 (dev) or Postgres (prod)
- SUPABASE_DB_* for Postgres connection

**Email (SMTP)**
- EMAIL_HOST: e.g., smtp.gmail.com
- EMAIL_PORT: e.g., 587
- EMAIL_HOST_USER: sender email
- EMAIL_HOST_PASSWORD: app password (not account password)
- EMAIL_USE_TLS: True for port 587, False for 465 (SSL)
- DEFAULT_FROM_EMAIL: sender display name

**Future OAuth**
- GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_IDS
- APPLE_SERVICE_ID, APPLE_BUNDLE_ID, APPLE_OAUTH_AUDIENCES

### Environment Variables (Frontend)

**app.json extras**
- googleClientIdWeb, googleClientIdIos, googleClientIdAndroid, googleClientIdExpo
- apiBaseUrl: Backend API root (default: http://127.0.0.1:8000/api)

---

## Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Django 6.x | Web framework |
| | Django REST Framework | API serialization & views |
| | SQLite / Postgres | Database |
| | OpenWeather API | Weather data |
| | django-cors-headers | CORS handling |
| | Pillow | Image processing (avatars) |
| **Frontend** | React Native (Expo) | Mobile framework |
| | TypeScript | Type safety |
| | React Navigation | Screen/tab routing |
| | axios | HTTP client |
| | AsyncStorage | Local caching |
| | expo-location | GPS coordinates |
| | expo-image | Background images |
| | Ionicons, MaterialCommunityIcons | Icon sets |

---

## Security Considerations

1. **Token Auth**: All endpoints except login/signup/forgot/reset require token
2. **Password Hashing**: Django's PBKDF2 (default) or bcrypt
3. **CORS**: Limited to specified origins
4. **Email Codes**: 6-digit, time-limited (10 min), single-use
5. **User Enumeration**: Forgot password returns generic message (safe if account doesn't exist)
6. **HTTPS**: Required in production (dev uses http://127.0.0.1)
7. **Env Vars**: Sensitive data (API keys, passwords) never committed to repo

---

## Performance Optimizations

1. **DB Caching**: Weather cached for 30 min → reduces API calls
2. **AsyncStorage**: User-level cache → offline capability, faster loads
3. **Image Caching**: expo-image cachePolicy='none' + query param bust
4. **Request Deduplication**: Home screen uses ref to prevent duplicate weather fetches
5. **Lazy Loading**: Navigation stack only loads screens as needed
6. **Memoization**: Emoji/condition helpers avoid recalculation

---

## Future Enhancements

1. **Social Auth**: Google & Apple OAuth (scaffold exists, needs implementation)
2. **Email Verification**: On signup (use ConfirmationCode model)
3. **One Call 3.0**: Upgrade to paid plan for 12-hourly + 10-day forecast
4. **Notifications**: Push alerts for severe weather
5. **Favorites**: Save location with custom names/notes
6. **Dark Mode**: Theme switcher in settings
7. **Multi-Language**: i18n for Spanish, French, etc.
8. **Analytics**: Track usage patterns, popular locations

---

**Last Updated**: May 2026  
**Version**: 1.0 (Beta)
