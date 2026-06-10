ARG PYTHON_VERSION=3.12.6-slim-bullseye
FROM python:${PYTHON_VERSION}

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=True
ENV APP_HOME=/app
WORKDIR $APP_HOME

RUN apt-get update && \
    apt-get install -y openssh-client libpq-dev postgresql libpq-dev gdal-bin libgdal-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . ./

# Shared mmap dir for prometheus-client multiprocess mode. Must exist before the app
# imports (the instrumentator validates it when PROMETHEUS_MULTIPROC_DIR is set).
RUN mkdir -p /tmp/prometheus_multiproc

# Worker count comes from the WEB_CONCURRENCY env var (set in fly.toml), which uvicorn
# reads when --workers is not passed. Defaults to 1 when unset (e.g. local runs).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
