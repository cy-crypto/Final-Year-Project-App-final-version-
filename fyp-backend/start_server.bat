@echo off
REM Starts the Django backend on 0.0.0.0:8080 so phones on the same Wi-Fi can reach it.
cd /d "%~dp0"
call venv\Scripts\activate
python manage.py runserver 0.0.0.0:8080
