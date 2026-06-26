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

# keep-alive must exceed the ALB idle timeout (120s); a shorter target
# keep-alive lets the server close connections the ALB is reusing -> 502s.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--timeout-keep-alive", "130"]
