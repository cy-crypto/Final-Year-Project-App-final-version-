#!/usr/bin/env bash
# Render build step: install packages, collect static files for WhiteNoise and apply migrations.
# Migrations run here because Render's free plan has no pre-deploy command.
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

# Names only, so a mis-named secret file is easy to spot in the log
echo "Secret files: $(ls -A /etc/secrets 2>/dev/null | tr '\n' ' ' || true)"

python manage.py collectstatic --no-input
# Show which database host the deploy uses (no credentials), to spot a wrong DATABASE_URL quickly
DJANGO_SETTINGS_MODULE=config.settings python -c "import django; django.setup(); from django.conf import settings; db = settings.DATABASES['default']; print('Database:', db['ENGINE'].rsplit('.', 1)[-1], db.get('HOST') or db.get('NAME'), db.get('PORT') or '')"
python manage.py migrate --no-input
