# Stage 1: Build the Vite application
FROM node:20-alpine as builder

WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock) first to leverage Docker cache
COPY app/package.json app/package-lock.json* ./
# If using yarn, use COPY app/yarn.lock ./

# Install dependencies
RUN npm install
# If using yarn, use RUN yarn install

# Copy the rest of the application code
COPY app/ .

# Build the Vite application
RUN npm run build
# If your build script is different, adjust the command accordingly

# Stage 2: Serve the built application using Nginx
FROM nginx:alpine

# Copy the built files from the builder stage into the Nginx public directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Command to run Nginx
CMD ["nginx", "-g", "daemon off;"]
