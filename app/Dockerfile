# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=21.7.1
FROM node:${NODE_VERSION}-slim as base

LABEL fly_launch_runtime="Next.js"

# Next.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"

# Throw-away build stage to reduce size of final image
FROM base as build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_S3_BUCKET_URL

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3 ca-certificates 

# Install Bun
RUN npm i -g bun

# Install node modules
COPY --link bun.lock package.json ./
RUN bun install --include=dev

RUN echo NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL && \
    echo "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL" > .env.production && \
    echo "NEXT_PUBLIC_S3_BUCKET_URL=$NEXT_PUBLIC_S3_BUCKET_URL" >> .env.production

# Copy application code
COPY --link . .

# Build application
RUN bun run build

# Final stage for app image
FROM base

# Copy built application
COPY --from=build /app /app

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD [ "bun", "run", "start" ]
