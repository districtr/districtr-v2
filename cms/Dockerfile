# Production image for the Districtr CMS (Wagtail) on Fly.io
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production

WORKDIR /districtr-cms

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# collectstatic needs settings to load; the real secret comes from Fly at runtime.
RUN DJANGO_SECRET_KEY=build-only python manage.py collectstatic --noinput

EXPOSE 8080

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8080", "--workers", "2", "--timeout", "60"]
