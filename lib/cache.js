const { LRUCache } = require('lru-cache');

class MemoryCache {
  constructor(max = 500) {
    this.cache = new LRUCache({ max });
  }

  async get(key) {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return hit.value;
  }

  async set(key, value, ttlMs) {
    this.cache.set(key, { value, expiresAt: Date.now() + Number(ttlMs || 0) });
  }
}

function withTimeout(operation, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Redis operation timed out')), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

async function disconnect(client) {
  if (client?.isOpen) await client.disconnect().catch(() => {});
}

// The local copy preserves service availability if Redis becomes unavailable after startup.
class RedisCache {
  constructor(
    client,
    { prefix = 'satapp:cache:', timeoutMs = 1500, fallback = new MemoryCache() } = {},
  ) {
    this.client = client;
    this.prefix = prefix;
    this.timeoutMs = timeoutMs;
    this.fallback = fallback;
    this.failed = false;
  }

  async fail() {
    this.failed = true;
    await disconnect(this.client);
  }

  async get(key) {
    if (this.failed) return this.fallback.get(key);
    try {
      const raw = await withTimeout(this.client.get(`${this.prefix}${key}`), this.timeoutMs);
      return raw ? JSON.parse(raw) : this.fallback.get(key);
    } catch {
      await this.fail();
      return this.fallback.get(key);
    }
  }

  async set(key, value, ttlMs) {
    await this.fallback.set(key, value, ttlMs);
    if (this.failed) return;
    try {
      const ttlSeconds = Math.max(1, Math.ceil(Number(ttlMs || 0) / 1000));
      await withTimeout(
        this.client.setEx(`${this.prefix}${key}`, ttlSeconds, JSON.stringify(value)),
        this.timeoutMs,
      );
    } catch {
      await this.fail();
    }
  }
}

async function createCache({
  redisUrl = process.env.REDIS_URL,
  timeoutMs = 1500,
  createClient = require('redis').createClient,
} = {}) {
  const fallback = new MemoryCache();
  const memory = { provider: 'memory', cache: fallback, close: async () => {} };
  if (!redisUrl) return memory;

  let client;
  try {
    client = createClient({
      url: redisUrl,
      socket: { connectTimeout: timeoutMs, reconnectStrategy: false },
      disableOfflineQueue: true,
    });
    client.on('error', (error) => console.warn('[cache] redis error:', error.message));
    await withTimeout(client.connect(), timeoutMs);
    return {
      provider: 'redis',
      cache: new RedisCache(client, { fallback, timeoutMs }),
      close: () => disconnect(client),
    };
  } catch (error) {
    await disconnect(client);
    console.warn('[cache] redis unavailable, fallback to memory:', error.message);
    return memory;
  }
}

module.exports = { createCache, MemoryCache, RedisCache };
