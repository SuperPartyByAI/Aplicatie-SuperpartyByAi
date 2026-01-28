# Redis Setup Guide

## ✅ Ce Am Implementat

Redis caching cu automatic fallback la in-memory cache.

**Fișiere create/modificate:**

- `shared/redis-cache.js` - Redis cache implementation
- `whatsapp-backend/server.js` - Updated to use Redis
- `package.json` - Added ioredis dependency

---

## 🚀 Cum Să Adaugi Redis în legacy hosting

### Opțiunea 1: legacy hosting Dashboard (Recomandat)

1. **Deschide legacy hosting Dashboard**
   - Mergi la [legacy hosting.app](https://legacy hosting.app)
   - Selectează proiectul tău

2. **Adaugă Redis**
   - Click pe "New" → "Database" → "Add Redis"
   - legacy hosting va crea automat un Redis instance
   - Va seta automat variabila `REDIS_URL`

3. **Verifică Variabila**
   - Mergi la "Variables"
   - Verifică că există `REDIS_URL`
   - Format: `redis://default:password@host:port`

4. **Redeploy**
   - legacy hosting va redeploy automat
   - Aplicația va detecta Redis și îl va folosi

---

### Opțiunea 2: legacy hosting CLI

```bash
# Install legacy hosting CLI
npm install -g @legacy hosting/cli

# Login
legacy hosting login

# Link to project
legacy hosting link

# Add Redis
legacy hosting add redis

# Check variables
legacy hosting variables

# Deploy
git push origin main
```

---

## 📊 Verificare

### 1. Check Logs

```bash
# legacy hosting logs
legacy hosting logs

# Caută:
# ✅ Redis connected successfully
```

### 2. Test Cache Endpoint

```bash
# Get cache stats
curl https://your-app.legacy hosting.app/api/cache/stats

# Response:
{
  "success": true,
  "cache": {
    "enabled": true,
    "type": "redis",
    "connected": true,
    "keys": 0
  }
}
```

### 3. Test Caching

```bash
# First request (cache miss)
curl https://your-app.legacy hosting.app/api/accounts
# Response time: ~500ms

# Second request (cache hit)
curl https://your-app.legacy hosting.app/api/accounts
# Response time: ~50ms (10x faster!)
```

---

## 🔧 Configurare Locală (Development)

### Opțiunea 1: Docker (Recomandat)

```bash
# Start Redis
docker run -d -p 6379:6379 --name redis redis:alpine

# Set environment variable
export REDIS_URL=redis://localhost:6379

# Start app
npm start
```

### Opțiunea 2: Redis Local

```bash
# Install Redis (Ubuntu/Debian)
sudo apt-get install redis-server

# Start Redis
redis-server

# Set environment variable
export REDIS_URL=redis://localhost:6379

# Start app
npm start
```

### Opțiunea 3: Fără Redis (Fallback)

```bash
# Nu seta REDIS_URL
# App va folosi in-memory cache automat

npm start

# Logs:
# ⚠️ REDIS_URL not found, using in-memory cache
```

---

## 📋 Environment Variables

### legacy hosting Production

```bash
# legacy hosting setează automat când adaugi Redis
REDIS_URL=redis://default:password@host:port
```

### Local Development

```bash
# .env file
REDIS_URL=redis://localhost:6379

# Sau pentru Docker
REDIS_URL=redis://localhost:6379

# Sau lasă gol pentru in-memory cache
# REDIS_URL=
```

---

## 🎯 Cum Funcționează

### Automatic Fallback

```javascript
// App încearcă să se conecteze la Redis
if (process.env.REDIS_URL) {
  // Folosește Redis
  console.log('✅ Redis connected');
} else {
  // Fallback la in-memory cache
  console.log('⚠️ Using in-memory cache');
}
```

### Cache Usage

```javascript
// Același API pentru ambele
const cache = require('./shared/redis-cache');

// Set
await cache.set('key', 'value', 30000); // 30s TTL

// Get
const value = await cache.get('key');

// getOrSet pattern
const data = await cache.getOrSet(
  'users',
  async () => {
    return await fetchUsersFromDB();
  },
  60000
); // 60s TTL
```

---

## 📊 Beneficii

### Fără Redis (In-Memory):

- Cache se pierde la restart
- Nu e shared între instances
- Limitat la RAM-ul unui instance

### Cu Redis:

- ✅ Cache persistent (supraviețuiește restart-urilor)
- ✅ Shared între toate instances
- ✅ Scalabil (multiple instances)
- ✅ 10-100x mai rapid decât database

---

## 🔍 Monitoring

### Cache Stats Endpoint

```bash
GET /api/cache/stats

Response:
{
  "success": true,
  "cache": {
    "enabled": true,
    "type": "redis",
    "connected": true,
    "keys": 42,
    "info": "...",
    "keyspace": "..."
  },
  "featureFlags": {
    "caching": true,
    "cacheTTL": 30
  }
}
```

### Logs

```bash
# Redis connected
✅ Redis connected successfully

# Redis error (fallback to memory)
❌ Redis error: Connection refused
⚠️ Redis connection closed, falling back to memory cache

# Cache operations
Redis set: accounts (TTL: 30s)
Redis get: accounts (HIT)
Redis get: users (MISS)
```

---

## 💰 Costuri

### legacy hosting Redis Pricing

- **Starter:** $5/month
  - 256MB RAM
  - Perfect pentru aplicația ta
  - Persistent storage
  - Automatic backups

- **Pro:** $10/month
  - 512MB RAM
  - Mai mult storage
  - Pentru scale mai mare

**Recomandare:** Începe cu Starter ($5/month)

---

## 🐛 Troubleshooting

### Redis nu se conectează

**Verifică:**

1. `REDIS_URL` este setat corect
2. Redis instance este running în legacy hosting
3. Logs pentru erori de conexiune

**Soluție:**

- App va folosi automat in-memory cache
- Nu va crăpa aplicația

---

### Cache nu funcționează

**Verifică:**

1. Feature flag `FF_API_CACHING=true`
2. Cache stats endpoint: `/api/cache/stats`
3. Logs pentru cache operations

**Debug:**

```bash
# Check cache type
curl https://your-app.legacy hosting.app/api/cache/stats

# Should show:
# "type": "redis" (dacă Redis e conectat)
# "type": "memory" (dacă fallback)
```

---

### Performance nu s-a îmbunătățit

**Verifică:**

1. Cache hit rate în logs
2. TTL settings (poate e prea scurt)
3. Cache keys (poate nu se folosesc)

**Ajustează TTL:**

```bash
# Environment variable
FF_CACHE_TTL=60  # 60 seconds

# Sau în cod
await cache.set('key', value, 60000); // 60s
```

---

## 📈 Expected Results

### Before Redis:

```
Request 1: 500ms (database query)
Request 2: 500ms (database query again)
Request 3: 500ms (database query again)
Total: 1500ms
Database queries: 3
```

### After Redis:

```
Request 1: 500ms (database query + cache set)
Request 2: 50ms (cache hit!)
Request 3: 50ms (cache hit!)
Total: 600ms (60% faster!)
Database queries: 1 (67% reduction!)
```

---

## 🎯 Next Steps

1. **Adaugă Redis în legacy hosting** (5 minute)
2. **Verifică logs** pentru "Redis connected"
3. **Test cache endpoint** `/api/cache/stats`
4. **Monitor performance** (response times)
5. **Ajustează TTL** dacă e necesar

---

## 📞 Support

**Probleme?**

- Check logs: `legacy hosting logs`
- Check cache stats: `/api/cache/stats`
- App va funcționa cu in-memory cache dacă Redis nu e disponibil

**Redis este opțional dar recomandat pentru production!**
