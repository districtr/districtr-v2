# Production image for the Districtr CMS (Wagtail) on Fly.io
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production

WORKDIR /districtr-cms

COPY requirements.txt requirements.lock ./
RUN pip install --no-cache-dir -r requirements.txt -c requirements.lock

COPY . .

# collectstatic needs settings to load; the real secret comes from Fly at runtime.
RUN DJANGO_SECRET_KEY=build-only python manage.py collectstatic --noinput

EXPOSE 8080

# --threads (gthread): a slow backend call (a cold map evaluation on the
# Portals metrics page, up to ~2 min) holds one thread, not a whole worker, so
# the rest of the admin stays responsive. --timeout 120 matches the ALB idle
# timeout (infra/alb.ts); nothing longer can reach the browser anyway.
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "4", "--timeout", "120"]
