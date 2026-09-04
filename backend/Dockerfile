ARG PYTHON_VERSION=3.12.6-slim-bullseye
FROM python:${PYTHON_VERSION}

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=True
ENV APP_HOME=/app
WORKDIR $APP_HOME

# Retries apt-get update+install a few times: deb.debian.org is a CDN in
# front of many mirror origins, and a -security point-release rotation can
# leave one edge's index listing a filename another edge has already
# purged, producing a 404 that a fresh apt-get update usually resolves on
# the next attempt (seen live: PR #723's preview build, 2026-09-04).
RUN for i in 1 2 3 4 5; do \
      apt-get update && \
      apt-get install -y openssh-client libpq-dev postgresql libpq-dev gdal-bin libgdal-dev \
      && break || { echo "apt-get attempt $i failed, retrying..."; sleep 10; }; \
    done && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . ./

# keep-alive must exceed the ALB idle timeout (120s); a shorter target
# keep-alive lets the server close connections the ALB is reusing -> 502s.
# Workers share graph memory via the mmap disk cache (GRAPH_CACHE_PATH),
# so extra workers do not duplicate the big graph arrays.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--timeout-keep-alive", "130", "--workers", "2"]
