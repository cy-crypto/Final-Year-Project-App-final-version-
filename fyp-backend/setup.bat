@echo off
REM One-time backend setup for Windows: creates venv, installs pinned packages, prepares .env and database.
cd /d "%~dp0"
if not exist venv (
    py -3.14 -m venv venv || python -m venv venv
)
call venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
if not exist .env copy .env.example .env
python manage.py migrate
echo.
echo Backend ready. Start it with: start_server.bat
