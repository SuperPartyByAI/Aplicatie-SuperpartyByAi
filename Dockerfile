# Use Node.js 20 LTS (required by Baileys)
FROM node:20-slim

# Install only essential dependencies for Baileys
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Expose port (Railway sets PORT env var)
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
# Force rebuild Fri Dec 26 23:18:15 UTC 2025
