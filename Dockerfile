# Use official Node.js runtime as a parent image
FROM node:20-slim

# Set environment variables
ENV NODE_ENV=production
ENV PORT=7860

# Create and define the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Hugging Face Spaces runs with a non-root user (UID 1000)
# Create a user and grant access to the /app directory
RUN useradd -m -u 1000 user && chown -R user:user /app
USER user

# Expose the Hugging Face port
EXPOSE 7860

# Start the application
CMD ["node", "server.js"]
