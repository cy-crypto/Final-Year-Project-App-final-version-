# Changelog - Weather Feature & Authentication Updates

All major changes from development start to present.

## Backend Changes (fyp-backend/)

### Weather Module (weather/)

#### New Files
- **weather/services.py** - Created WeatherAdapter service class handling:
  - OpenWeather API integration with fallback strategy (One Call 3.0 → /data/2.5/weather + /forecast)
  - Geocoding cities to coordinates
  - 30-minute database caching via WeatherCache model
  - Error handling with custom WeatherAdapterError class
  - Parsing hourly (12h) and daily (5-7d) forecasts from free plan endpoints
  - Proper temperature, wind speed (m/s → km/h), humidity, sunrise/sunset, and precipitation (pop) extraction

- **weather/migrations/0002_weathercache.py** - Database migration for WeatherCache model

#### Modified Files
- **weather/models.py**
  - Added `WeatherCache` model: stores cached weather payloads with 30-min TTL
  - Fields: city_key (unique), city_name, payload (JSON), fetched_at (indexed), ordering by -fetched_at

- **weather/views.py**
  - Refactored `WeatherByCityView` to use new WeatherAdapter service (removed inline OpenWeather calls)
  - Added `WeatherHealthView` (GET /weather/health/) for health checks
  - Updated `SavedLocationViewSet.create()` to handle IntegrityError (duplicate location detection)
  - Fixed indentation issues (tabs → spaces)

- **weather/urls.py**
  - Added route for health check: `path('weather/health/', WeatherHealthView.as_view())`

### Accounts Module (accounts/)

#### New Files
- **accounts/migrations/0004_confirmationcode_and_social_fields.py** - Adds ConfirmationCode model and social auth fields

#### Modified Files
- **accounts/models.py**
  - Added `ConfirmationCode` model for password reset codes (email, code, created_at, expires_at, used fields)
  - Added fields to `UserProfile`: email_confirmed, social_provider, social_subject (for future social auth)

- **accounts/serializers.py**
  - Added `full_name` field to SignupSerializer
  - Added `ForgotPasswordSerializer` (email validation)
  - Added `ResetPasswordSerializer` (email, code, new_password validation)
  - Added `VerifyCodeSerializer`, `ResendCodeSerializer`, `SocialAuthSerializer` (future use)

- **accounts/views.py**
  - Added helper function `_create_confirmation_code()` (generates 6-digit code, 10-min expiry)
  - Modified `SignupView` to accept optional full_name and save to profile
  - Added `ForgotPasswordView` (POST /auth/password/forgot/) - generates reset code, sends email, avoids user enumeration
  - Added `ResetPasswordView` (POST /auth/password/reset/) - validates code, resets password, marks code as used
  - Email sending via Django's `send_mail()` with settings from env vars

- **accounts/urls.py**
  - Added routes:
    - `path('password/forgot/', ForgotPasswordView.as_view())`
    - `path('password/reset/', ResetPasswordView.as_view())`

### Configuration (config/)

- **config/settings.py**
  - Added email backend configuration from env vars:
    - EMAIL_BACKEND, EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD
    - EMAIL_USE_TLS, EMAIL_USE_SSL, DEFAULT_FROM_EMAIL
  - Falls back to console EmailBackend if no EMAIL_HOST configured

- **requirements.txt**
  - Added: `google-auth==2.40.3`, `PyJWT==2.10.1`, `requests>=2.32.3` (for OAuth token verification)

### Scripts & Config
- **.env.example** - Created template with all env vars (API keys, SMTP, social auth, etc.)
- **scripts/test_openweather_key.py** - Utility to validate OpenWeather API key via geocoding endpoint

---

## Frontend Changes (fyp-project-app/)

### Weather Screen (screens/WeatherScreen.tsx)

**Major Redesign**: Converted from basic text UI to iOS-style Weather app layout.

#### Key Features Added
- **GPS-First Flow**: 
  - Loads device location on mount (with permission prompt)
  - Falls back to saved selected_city if GPS fails
  - AsyncStorage preference saved (allow device location on/off)

- **AsyncStorage Caching**:
  - Caches weather for each city locally
  - Shows stale banner when serving cached data
  - Clears cache on successful fresh fetch

- **ImageBackground with Condition-Based Backgrounds**:
  - Wikipedia images for Sunny, Cloudy, Rainy, Stormy, Snowy, Hazy conditions
  - Cache-busting via query params to avoid stale images
  - Semi-transparent overlay for text readability

- **Emoji-Based Icons with Day/Night Logic**:
  - `🌞` (sunny), `🌙` (clear night), `🌥️` (cloud), `🌧️` (rain), `⛈️` (storm), `🌨️` (snow), `😶‍🌫️` (haze)
  - Uses timezone offset to compute local hour; determines night if hour < 6 or >= 19
  - Sunrise/sunset times from daily forecast for more precise day/night boundaries

- **Hourly Forecast**:
  - Horizontal scrolling card list (12 hours)
  - Displays: time, emoji, temp, precipitation probability
  - Conditional precipitation: uses pop if available, else condition-based fallback ranges
  - Fallback ranges: Storm 60-90%, Rain 40-70%, Snow 30-60%, Cloud 15-35%, Haze 10-25%, Clear <5-15%

- **Daily Forecast**:
  - List of 5 days with date, emoji, high/low temps, precipitation
  - Same condition-based precipitation fallback for missing pop

- **Location Picker Bottom Sheet**:
  - Modal overlay showing city search, device location button, save location button
  - Lists saved locations with current weather
  - Tap location to load its weather
  - Shows location permission denied message if declined

- **Condition Summary & Wind Info**:
  - Narrative descriptions (e.g., "Cloud cover tonight, continuing through morning.")
  - Displays wind speed in km/h (converted from m/s)
  - Humidity percentage

#### Updated Backend Integration
- Parses new WeatherAdapter response structure (current, hourly, daily, timezone_offset, lat, lon, sunrise, sunset)
- Handles missing/null hourly/daily arrays gracefully
- Rounded temperatures (0 decimals)
- Proper timezone-aware time formatting

### Home Screen (screens/HomeScreen.tsx)

#### Changes
- **Auto-fetch weather on mount** using selected_city (with 10-min dedup via ref)
- Added weather emoji + condition label in KPI card
- Weather snapshot includes emoji + "Clear" label for night-time sunny conditions
- Rounded temperature display

#### Helper Functions
- `resolveHomeWeatherEmoji()` - maps condition to emoji with night awareness
- `isNightNow()` - local hour < 6 or >= 19

### Login Screen (screens/LoginScreen.tsx)

#### Password Reset Modal
- **Forgot Password Button** → Modal with three-step flow:
  1. **Send Code**: Enter email, tap "Send Code" → backend sends email
  2. **Enter Code & New Password**: Paste reset code + new password
  3. **Reset Password**: Validates and submits
- Modal state: showReset, resetEmail, resetCode, resetPasswordValue, resetLoading
- Displays success/error alerts
- Auto-closes on success

#### Social Auth Placeholders
- "Google Sign In" → "Coming soon" alert
- "Apple Sign In" → "Coming soon" alert

### Signup Screen (screens/SignupScreen.tsx)

#### Changes
- Added **full_name** field (optional)
- Updated labels & placeholders for clarity
- Added social buttons placeholder section (Google, Apple) - "Coming soon"
- Adjusted button text ("Sign Up" → "Create account", "Login" → "Sign in")

### Auth Service (services/authService.ts)

#### New Functions
- `requestPasswordReset(email: string)` - POST /auth/password/forgot/
- `resetPassword(email: string, code: string, newPassword: string)` - POST /auth/password/reset/

#### Modified Functions
- `signup()` - now accepts optional `full_name` parameter, passes to backend

### Auth Context (context/AuthContext.tsx)

#### Changes
- `signup()` signature updated to accept optional `fullName` parameter
- Passes fullName to signupRequest() service call

### Screen Container (components/ScreenContainer.tsx)

#### Changes
- Added optional `hideHeader` prop
- Conditionally renders header based on `hideHeader` boolean

### Other Components

- **ScreenContainer.tsx**: Added hideHeader prop to hide header when needed (used in WeatherScreen)
- **AppNavigator.tsx**: Added ConfirmCodeScreen to navigation stack
- **types.ts**: Added Confirm route with optional email parameter

### Package Updates (package.json)

Added dependencies for future social authentication:
- `expo-apple-authentication` (~8.0.8)
- `expo-auth-session` (~7.0.11)
- `expo-crypto` (~15.0.9)

### App Configuration (app.json)

Added extra fields:
- `googleClientIdWeb`, `googleClientIdIos`, `googleClientIdAndroid`, `googleClientIdExpo`
- `apiBaseUrl` (default: http://127.0.0.1:8000/api)

### Weather Service (services/weatherService.ts)

#### Major Refactoring
- `WeatherSnapshot` type now includes:
  - lat, lon (coordinates)
  - temperatureC, feelsLikeC, windSpeedKph
  - sunrise, sunset, timezoneOffset
  - condition (normalized), description, icon
  - minC, maxC (from daily or derived from hourly)
  - humidity
  - hourly (12 items with dt, temp, pop, humidity, condition, icon)
  - daily (5 items with dt, date, temp_min, temp_max, sunrise, sunset, pop, humidity, condition)

#### Helper Functions
- `normalizeCondition()` - maps all OpenWeather conditions to: Sunny, Cloudy, Rainy, Stormy, Snowy, Hazy, Windy
- `toIsoDateFromSeconds()` - converts Unix timestamp to YYYY-MM-DD
- Min/max derivation from daily[0] first, fallback to hourly temps

---

## Architecture Notes

### Backend Stack
- **Django 6.x** + **Django REST Framework**
- **OpenWeather API**: Uses free plan endpoints (/data/2.5/weather, /forecast)
- **Database Caching**: WeatherCache model with 30-min TTL
- **Email**: Django SMTP backend configurable via env vars
- **Auth**: Token-based with email/password + optional social fields

### Frontend Stack
- **React Native (Expo)**
- **TypeScript** for type safety
- **AsyncStorage** for local caching
- **expo-location** for device GPS
- **expo-image** for cached background images
- **Timezone-aware time formatting** for hourly/daily display

### Data Flow
1. User opens Weather tab → GPS permission prompt
2. If allowed, fetch device location → geocode to city → fetch weather
3. Cache result in AsyncStorage + DB
4. Render iOS-style layout with background image, emoji, hourly/daily forecast
5. User can manually search/change location via bottom sheet picker
6. Saved locations updated in DB + displayed in picker

### Email & Password Reset
1. User taps "Forgot Password" → enters email
2. Backend generates 6-digit code, stores in ConfirmationCode, sends email
3. User enters code + new password
4. Backend validates code expiry & hasn't been used
5. Updates user.password, marks code as used
6. Frontend shows success, navigates to login

---

## Testing Checklist

- [ ] Backend: Weather health check returns 200 (API key valid)
- [ ] Backend: /weather/?city=London returns full structure with hourly/daily
- [ ] Backend: Subsequent requests for same city use DB cache
- [ ] Backend: Password reset flow: request → email → reset → login works
- [ ] Frontend: Weather tab loads device location on first visit
- [ ] Frontend: Saved locations sync with backend
- [ ] Frontend: Background image updates per condition
- [ ] Frontend: Emoji changes based on day/night logic
- [ ] Frontend: Hourly/daily precipitation shows pop or condition-based fallback
- [ ] Frontend: Stale cache banner displays with timestamp
- [ ] Frontend: Home screen weather updates on app open
- [ ] Frontend: Password reset modal sends code, resets, shows success

---

## Known Limitations & Future Work

- One Call 3.0 API (12-hourly + 10-day) requires paid plan; reverted to free plan strategy
- Precipitation (pop) sometimes 0 on free plan; condition-based fallback added
- Social OAuth (Google, Apple) endpoints scaffolded but not fully implemented
- Sunrise/sunset logic simplified (uses daily times or assumes 6am/7pm boundaries)
- No email verification on signup (only password reset uses codes)

---

**Last Updated**: May 2026  
**Status**: Feature complete for weather & password reset. Ready for social auth integration.
