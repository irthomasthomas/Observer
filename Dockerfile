# Stage 1: Build the Vite application
FROM node:20-alpine as builder

WORKDIR /app
COPY app/package.json app/package-lock.json* ./
RUN npm install
COPY app/ .
RUN npm run build

# Stage 2: Nginx + Python Proxy ONLY
FROM nginx:alpine

# Install Python, pip, openssl (for cert generation), supervisor
# NO curl, NO gcompat, NO Ollama installation here
RUN apk add --no-cache python3 py3-pip openssl supervisor

# --- Nginx Setup ---
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80

# --- Python Proxy Setup ---
RUN mkdir -p /opt/observer-ollama /var/log/supervisor
COPY ./observer-ollama /opt/observer-ollama/
WORKDIR /opt/observer-ollama
RUN pip3 install --break-system-packages .
EXPOSE 3838

# --- Tell user webpage is available ---
COPY ./print_info.sh /usr/local/bin/print_info.sh # Copy the script
RUN chmod +x /usr/local/bin/print_info.sh         # Ensure it's executable

# --- Supervisor Setup ---
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf 
WORKDIR /

# Command to run Supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
