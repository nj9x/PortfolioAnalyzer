# ============================================================
# Stage 1: Build the React frontend
# ============================================================
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# Install dependencies first (cache layer)
COPY ../frontend/package.json ../frontend/package-lock.json* ./
RUN npm ci

# Copy source and build
COPY ../frontend/ ./
RUN npm run build

# ============================================================
# Stage 2: PHP/Laravel backend + frontend static files
# ============================================================
FROM php:8.3-fpm-alpine

# Install system deps and PHP extensions
RUN apk add --no-cache \
    nginx \
    supervisor \
    curl \
    libpq-dev \
    oniguruma-dev \
    libzip-dev \
    && docker-php-ext-install pdo pdo_pgsql pdo_mysql mbstring zip opcache

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Install PHP dependencies (cache layer)
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist

# Copy application source
COPY . .
RUN composer dump-autoload --optimize

# Copy built frontend from stage 1
COPY --from=frontend-build /app/frontend/dist ./public/frontend-dist

# Create required directories
RUN mkdir -p storage/app/charts storage/logs storage/framework/{cache,sessions,views} \
    && chown -R www-data:www-data storage bootstrap/cache

# Nginx configuration
RUN cat > /etc/nginx/http.d/default.conf << 'NGINX'
server {
    listen 8000;
    server_name _;
    root /app/public;
    index index.php;

    # API routes
    location /api {
        try_files $uri /index.php?$query_string;
    }

    # Static assets from frontend build
    location /assets {
        alias /app/public/frontend-dist/assets;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA catch-all
    location / {
        try_files $uri $uri/ /frontend-dist/index.html /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass 127.0.0.1:9000;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }
}
NGINX

# Supervisord config
RUN cat > /etc/supervisord.conf << 'SUPER'
[supervisord]
nodaemon=true
logfile=/dev/stdout
logfile_maxbytes=0

[program:php-fpm]
command=php-fpm -F
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:nginx]
command=nginx -g "daemon off;"
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
SUPER

# Generate app key and run migrations at startup
RUN cat > /app/docker-entrypoint.sh << 'ENTRY'
#!/bin/sh
set -e

# Generate key if not set
php artisan key:generate --force --no-interaction 2>/dev/null || true

# Run migrations
php artisan migrate --force --no-interaction

# Cache config
php artisan config:cache
php artisan route:cache

exec supervisord -c /etc/supervisord.conf
ENTRY

RUN chmod +x /app/docker-entrypoint.sh

ENV APP_ENV=production
ENV APP_DEBUG=false

EXPOSE 8000

CMD ["/app/docker-entrypoint.sh"]
