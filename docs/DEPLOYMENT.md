# Deployment Guide

This guide covers deploying the AI Trader platform to production.

## Prerequisites

- Docker and Docker Compose installed
- Domain name (for production)
- SSL certificate (recommended)
- Secure secrets generated

## Environment Setup

### Backend Environment Variables

Create `.env` in the project root:

```bash
# Environment
NODE_ENV=production
PORT=3000

# Database (Update with production credentials)
DATABASE_URL=postgresql://user:password@postgres:5432/ai_trader

# Redis (Update with production credentials)
REDIS_URL=redis://redis:6379
REDIS_PASSWORD=your-secure-redis-password
REDIS_DB=0

# JWT (CRITICAL: Generate secure secret)
# Generate: openssl rand -hex 32
JWT_SECRET=your-production-secret-min-32-chars
JWT_EXPIRES_IN=24h

# Binance API (Required for LIVE mode)
BINANCE_API_KEY=your-binance-api-key
BINANCE_API_SECRET=your-binance-api-secret
```

### Frontend Environment Variables

Frontend environment variables are configured in `docker-compose.yml` or set at build time:

```bash
# Production API endpoint
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com

# Production WebSocket endpoint
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com
```

## Local Production Build

Test production builds locally before deploying:

### Backend

```bash
# Build backend image
docker build -t ai-trader-backend -f Dockerfile .

# Run backend
docker run -p 3000:3000 \
  --env-file .env \
  ai-trader-backend
```

### Frontend

```bash
# Build frontend image
docker build -t ai-trader-frontend -f apps/web/Dockerfile .

# Run frontend
docker run -p 3001:3001 \
  -e NEXT_PUBLIC_API_BASE_URL=http://localhost:3000 \
  -e NEXT_PUBLIC_WS_URL=ws://localhost:3000 \
  ai-trader-frontend
```

## Docker Compose Deployment

### Full Stack Deployment

```bash
# Start all services (Production mode)
docker-compose up -d

# View logs
docker-compose logs -f

# Check service health
docker-compose ps

# Stop all services
docker-compose down
```

### Services Included

1. **postgres** - PostgreSQL with TimescaleDB (port 5432)
2. **redis** - Redis for caching and queues (port 6379)
3. **backend** - Node.js API server (port 3000)
4. **frontend** - Next.js web application (port 3001)

## Production Checklist

### Security

- [ ] Generate secure JWT_SECRET (min 32 chars)
- [ ] Use strong database passwords
- [ ] Enable Redis authentication
- [ ] Configure firewall rules
- [ ] Enable HTTPS/SSL
- [ ] Set secure CORS origins
- [ ] Review security headers in next.config.js

### Database

- [ ] Run migrations: `node scripts/run-migrations.js`
- [ ] Verify database connectivity
- [ ] Set up automated backups
- [ ] Configure connection pooling

### Monitoring

- [ ] Set up health check monitoring
- [ ] Configure log aggregation
- [ ] Set up alerts for errors
- [ ] Monitor resource usage

### Performance

- [ ] Enable Redis caching
- [ ] Configure rate limiting
- [ ] Set up CDN for static assets (optional)
- [ ] Enable Next.js image optimization (if using CDN)

## Reverse Proxy Setup (Nginx)

Example Nginx configuration for production:

```nginx
# Backend API
upstream backend {
    server localhost:3000;
}

# Frontend
upstream frontend {
    server localhost:3001;
}

# API server
server {
    listen 80;
    server_name api.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Frontend
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Scaling Considerations

### Horizontal Scaling

To scale the application:

1. **Database**: Use managed PostgreSQL (AWS RDS, DigitalOcean, etc.)
2. **Redis**: Use managed Redis (AWS ElastiCache, Redis Cloud, etc.)
3. **Backend**: Run multiple instances behind load balancer
4. **Frontend**: Deploy to CDN edge locations (Vercel, Netlify, CloudFlare Pages)

### Docker Swarm / Kubernetes

For orchestration, convert docker-compose.yml to:

- Docker Swarm stack file
- Kubernetes manifests (Deployment, Service, Ingress)

## Health Checks

Monitor these endpoints:

```bash
# Backend health
curl https://api.yourdomain.com/api/v1/health

# Frontend (should return HTML)
curl https://yourdomain.com
```

## Troubleshooting

### Backend won't start

```bash
# Check logs
docker-compose logs backend

# Common issues:
# - Database not ready: Wait for postgres health check
# - Missing env vars: Check .env file
# - Port conflict: Change PORT in .env
```

### Frontend build fails

```bash
# Check if standalone output is working
cd apps/web
npm run build

# Common issues:
# - Missing dependencies: npm install
# - TypeScript errors: npm run type-check
# - Build errors: Check .next directory permissions
```

### Can't connect to API

```bash
# Verify backend is running
docker-compose ps backend

# Check network
docker-compose exec frontend ping backend

# Verify environment variables
docker-compose exec frontend env | grep NEXT_PUBLIC
```

## Updating Deployment

```bash
# Pull latest code
git pull origin main

# Rebuild and restart services
docker-compose up -d --build

# Run new migrations if needed
docker-compose exec backend node scripts/run-migrations.js

# Verify health
curl http://localhost:3000/api/v1/health
curl http://localhost:3001
```

## Backup and Recovery

### Database Backup

```bash
# Backup database
docker-compose exec postgres pg_dump -U postgres ai_trader > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres ai_trader < backup.sql
```

### Redis Backup

```bash
# Redis automatically saves to /data volume
# Backup the volume:
docker run --rm -v ai-trader_redis_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/redis-backup.tar.gz /data
```

## Support

For production issues:

1. Check logs: `docker-compose logs -f`
2. Review PRODUCTION_CHECKLIST.md for known blockers
3. Verify all environment variables are set correctly
4. Check health endpoints return 200 OK
