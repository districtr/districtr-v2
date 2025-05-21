# Use the official Python image from the Docker Hub
FROM python:3.12-slim

# Install system dependencies for GDAL and Tippecanoe
RUN apt-get update && apt-get install -y \
    gdal-bin \
    libgdal-dev \
    build-essential \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set the environment variable for GDAL
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

# Install Tippecanoe
RUN git clone https://github.com/felt/tippecanoe.git /tippecanoe \
    && cd /tippecanoe \
    && make -j \
    && make install \
    && rm -rf /tippecanoe

# Install UV
RUN curl -sSf https://astral.sh/uv/install.sh | sh

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install the required Python packages using UV
RUN uv pip install --no-cache -r requirements.txt

# Copy the rest of the application code into the container
COPY . .