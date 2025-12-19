FROM pgduckdb/pgduckdb:15-main

USER root

RUN apt-get update && \
    apt-mark hold locales && \
    apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    postgresql-server-dev-15 \
    postgresql-15-postgis-3

RUN apt-get remove -y build-essential postgresql-server-dev-15 cmake && \
    apt-get autoremove -y && \
    apt-mark unhold locales

RUN rm -rf /var/lib/apt/lists/*

# -------------------- previous attempt which hit an issue being on Debian 11...

# FROM postgis/postgis:15-3.3

# RUN apt-get update && \
#     apt-mark hold locales && \
#     apt-get install -y --no-install-recommends \
#     build-essential \
#     cmake \
#     curl

# RUN curl -sfL https://install.pgx.sh | sh -

# RUN pgxman install pg_duckdb

# RUN apt-get remove -y build-essential cmake curl && \
#     apt-get autoremove -y && \
#     apt-mark unhold locales && \
#     rm -rf /var/lib/apt/lists/*
