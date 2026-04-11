#!/usr/bin/env bash
# deploy-server.sh — LinkChat one-click production deployment
# Run on the server: bash scripts/deploy-server.sh
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# =====================================================
# Config
# =====================================================
DEPLOY_DIR="/opt/linkchat"
DOMAIN_API="linkchat-api.matrix-ai.com.cn"
DOMAIN_MINIO="linkchat-minio.matrix-ai.com.cn"
BACKUP_DIR="/opt/linkchat/backups"
CERT_EMAIL=""  # Set your email for Let's Encrypt notifications

# =====================================================
# Step 0: Prerequisites check
# =====================================================
log "Checking prerequisites..."

# Check root/sudo
if [[ $EUID -ne 0 ]]; then
  err "Please run as root or with sudo"
fi

# Install Docker if missing
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  log "Docker installed: $(docker --version)"
else
  log "Docker: $(docker --version)"
fi

# Install Docker Compose plugin if missing
if ! docker compose version &>/dev/null; then
  log "Installing Docker Compose plugin..."
  apt-get update -qq && apt-get install -y -qq docker-compose-plugin
fi
log "Docker Compose: $(docker compose version)"

# Install Nginx if missing
if ! command -v nginx &>/dev/null; then
  log "Installing Nginx..."
  apt-get update -qq && apt-get install -y -qq nginx
  systemctl enable --now nginx
else
  log "Nginx: $(nginx -v 2>&1)"
fi

# Install certbot if missing
if ! command -v certbot &>/dev/null; then
  log "Installing certbot..."
  apt-get install -y -qq certbot python3-certbot-nginx
fi

# Install pwgen for password generation
if ! command -v pwgen &>/dev/null; then
  apt-get install -y -qq pwgen
fi

# =====================================================
# Step 1: Generate JWT keys
# =====================================================
log "Generating JWT RSA key pairs..."

mkdir -p "$DEPLOY_DIR/keys"

if [[ ! -f "$DEPLOY_DIR/keys/jwt-private.pem" ]]; then
  openssl genrsa -out "$DEPLOY_DIR/keys/jwt-private.pem" 2048 2>/dev/null
  openssl rsa -in "$DEPLOY_DIR/keys/jwt-private.pem" -pubout -out "$DEPLOY_DIR/keys/jwt-public.pem" 2>/dev/null
  log "JWT key pair generated"
else
  warn "JWT key pair already exists, skipping"
fi

if [[ ! -f "$DEPLOY_DIR/keys/refresh-private.pem" ]]; then
  openssl genrsa -out "$DEPLOY_DIR/keys/refresh-private.pem" 2048 2>/dev/null
  openssl rsa -in "$DEPLOY_DIR/keys/refresh-private.pem" -pubout -out "$DEPLOY_DIR/keys/refresh-public.pem" 2>/dev/null
  log "Refresh key pair generated"
else
  warn "Refresh key pair already exists, skipping"
fi

# Base64 encode for env vars
AUTH_JWT_PRIVATE_KEY=$(base64 -w0 "$DEPLOY_DIR/keys/jwt-private.pem")
AUTH_JWT_PUBLIC_KEY=$(base64 -w0 "$DEPLOY_DIR/keys/jwt-public.pem")
AUTH_REFRESH_PRIVATE_KEY=$(base64 -w0 "$DEPLOY_DIR/keys/refresh-private.pem")
AUTH_REFRESH_PUBLIC_KEY=$(base64 -w0 "$DEPLOY_DIR/keys/refresh-public.pem")

# =====================================================
# Step 2: Generate passwords and create .env.production
# =====================================================
log "Generating production environment..."

DB_PASSWORD=$(pwgen -s 32 1)
S3_ACCESS_KEY=$(pwgen -s 20 1)
S3_SECRET_KEY=$(pwgen -s 40 1)

# Prompt for API keys
read -rp "Enter DeepSeek API Key (or press Enter to skip): " DEEPSEEK_KEY
read -rp "Enter KIMI API Key (or press Enter to skip): " KIMI_KEY

cat > "$DEPLOY_DIR/.env.production" << EOF
# Auto-generated $(date -Iseconds)
DB_PASSWORD=${DB_PASSWORD}

# JWT keys (base64 encoded)
AUTH_JWT_PRIVATE_KEY=${AUTH_JWT_PRIVATE_KEY}
AUTH_JWT_PUBLIC_KEY=${AUTH_JWT_PUBLIC_KEY}
AUTH_REFRESH_PRIVATE_KEY=${AUTH_REFRESH_PRIVATE_KEY}
AUTH_REFRESH_PUBLIC_KEY=${AUTH_REFRESH_PUBLIC_KEY}

# LLM
DEEPSEEK_API_KEY=${DEEPSEEK_KEY}
KIMI_API_KEY=${KIMI_KEY}

# MinIO
S3_ACCESS_KEY=${S3_ACCESS_KEY}
S3_SECRET_KEY=${S3_SECRET_KEY}

# Mail (disabled)
MAIL_HOST=
MAIL_PORT=587
MAIL_USER=
MAIL_PASSWORD=
EOF

chmod 600 "$DEPLOY_DIR/.env.production"
log ".env.production created at $DEPLOY_DIR/.env.production"

# =====================================================
# Step 3: Configure Swap (2GB)
# =====================================================
if [[ ! -f /swapfile ]]; then
  log "Configuring 2GB swap..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  log "Swap enabled (2GB)"
else
  warn "Swap already exists, skipping"
fi

# =====================================================
# Step 4: Configure Firewall
# =====================================================
log "Configuring firewall..."
ufw --force enable
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
log "Firewall: 22/80/443 open"

# =====================================================
# Step 5: SSL Certificate
# =====================================================
log "Setting up SSL certificates..."

mkdir -p /var/www/certbot
chown www-data:www-data /var/www/certbot

# Copy nginx config (HTTP only first for certbot challenge)
# Temporarily use a minimal HTTP config for cert
cat > /etc/nginx/sites-available/linkchat << 'NGINX_HTTP'
server {
    listen 80;
    server_name linkchat-api.matrix-ai.com.cn linkchat-minio.matrix-ai.com.cn;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
}
NGINX_HTTP

# Remove default site, enable linkchat
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/linkchat /etc/nginx/sites-enabled/linkchat
nginx -t && systemctl reload nginx

# Request certificates
log "Requesting Let's Encrypt certificates..."
certbot certonly --webroot \
  -w /var/www/certbot \
  -d "$DOMAIN_API" \
  -d "$DOMAIN_MINIO" \
  ${CERT_EMAIL:+--email "$CERT_EMAIL"} \
  --agree-tos --non-interactive

log "SSL certificates obtained"

# =====================================================
# Step 6: Deploy Nginx full config
# =====================================================
log "Installing Nginx production config..."

# Copy the full config from project
cp "$DEPLOY_DIR/nginx/nginx.conf" /etc/nginx/nginx.conf
cp "$DEPLOY_DIR/nginx/conf.d/default.conf" /etc/nginx/sites-available/linkchat.conf
rm -f /etc/nginx/sites-enabled/linkchat  # remove temp HTTP-only
ln -sf /etc/nginx/sites-available/linkchat.conf /etc/nginx/sites-enabled/linkchat.conf

nginx -t && systemctl reload nginx
log "Nginx configured with SSL"

# =====================================================
# Step 7: Docker Compose build & start
# =====================================================
log "Building and starting services..."
cd "$DEPLOY_DIR"

docker compose -f docker-compose.prod.yaml \
  --env-file .env.production \
  up -d --build

log "Waiting for services to be healthy..."
sleep 15

# Check health
if curl -sf http://127.0.0.1:3008/api/v1/health > /dev/null; then
  log "Server is healthy!"
else
  warn "Server not responding yet, checking logs..."
  docker compose -f docker-compose.prod.yaml logs server --tail 50
fi

# =====================================================
# Step 8: MinIO bucket initialization
# =====================================================
log "Initializing MinIO bucket..."
# Wait for MinIO to be ready
sleep 5

docker compose -f docker-compose.prod.yaml exec -T minio \
  mc alias set local http://localhost:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" 2>/dev/null || \
  docker compose -f docker-compose.prod.yaml exec -T minio \
    sh -c "mc alias set local http://localhost:9000 ${S3_ACCESS_KEY} ${S3_SECRET_KEY} && mc mb local/linkingchat-files 2>/dev/null; true"

log "MinIO bucket initialized"

# =====================================================
# Step 9: Database backup cron
# =====================================================
log "Setting up database backup cron..."
mkdir -p "$BACKUP_DIR"

cat > /etc/cron.d/linkchat-backup << EOF
# Daily PostgreSQL backup at 03:00, keep 7 days
0 3 * * * root docker exec linkchat-postgres-1 pg_dump -U linkingchat linkingchat | gzip > ${BACKUP_DIR}/linkingchat-\$(date +\%Y\%m\%d).sql.gz
0 4 * * * root find ${BACKUP_DIR} -name "linkingchat-*.sql.gz" -mtime +7 -delete
EOF
chmod 644 /etc/cron.d/linkchat-backup

log "Backup cron configured (daily 03:00, keep 7 days)"

# =====================================================
# Step 10: Verification
# =====================================================
log "======================================="
log "  Deployment Verification"
log "======================================="

echo ""
log "Health checks:"
curl -sf "https://${DOMAIN_API}/api/v1/health" && echo " ✅ API health" || echo " ❌ API health"

echo ""
echo -e "${GREEN}=======================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}=======================================${NC}"
echo ""
echo "  API:     https://${DOMAIN_API}/api/v1/health"
echo "  MinIO:   https://${DOMAIN_MINIO}/minio/health/live"
echo "  Swagger: disabled (production)"
echo ""
echo "  Config:  $DEPLOY_DIR/.env.production"
echo "  Keys:    $DEPLOY_DIR/keys/"
echo "  Backups: $BACKUP_DIR/"
echo ""
echo "  Useful commands:"
echo "    docker compose -f docker-compose.prod.yaml logs -f server"
echo "    docker compose -f docker-compose.prod.yaml ps"
echo "    docker compose -f docker-compose.prod.yaml restart server"
echo ""
