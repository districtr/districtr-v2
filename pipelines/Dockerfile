# Use the UV Python image
FROM ghcr.io/astral-sh/uv:python3.12-bookworm

# Install system dependencies for GDAL and Tippecanoe
RUN apt-get update && apt-get install -y \
    gdal-bin \
    libgdal-dev \
    build-essential \
    git \
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

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install the required Python packages using UV
RUN uv pip install --no-cache -r requirements.txt --system

# Copy the rest of the application code into the container
COPY . .

# Install test dependencies
RUN uv pip install --no-cache ".[test]" --system

# Set environment variables for testing
ENV PYTHONPATH=/app
ENV TESTING=1

# Default command to run tests
CMD ["pytest", "cleaning/tests", "-v", "--cov=cleaning", "--cov-report=term-missing"]