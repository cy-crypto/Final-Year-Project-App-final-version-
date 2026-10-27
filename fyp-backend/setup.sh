#!/usr/bin/env bash
# One-time backend setup for macOS/Linux: creates venv, installs pinned packages, prepares .env and database.
set -e
cd "$(dirname "$0")"
if [ ! -d venv ]; then
    python3.14 -m venv venv || python3 -m venv venv
fi
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
[ -f .env ] || cp .env.example .env
python manage.py migrate
echo
echo "Backend ready. Start it with: ./start_server.sh"
