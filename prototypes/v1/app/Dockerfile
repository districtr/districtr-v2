# Select base image
FROM node:20-buster

# Set working directory
WORKDIR /app

# Copy node packages
COPY package*.json ./

# Install dependencies
RUN npm i -g pnpm && pnpm install

# Copy the remaining app components
COPY . .

# Expose port for app development server
EXPOSE 3000

# Run the Next.js app upon container start
CMD ["pnpm", "dev"]