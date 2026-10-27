#!/usr/bin/env bash
# Starts the Django backend on 0.0.0.0:8080 so phones on the same Wi-Fi can reach it.
cd "$(dirname "$0")"
source venv/bin/activate
python manage.py runserver 0.0.0.0:8080
