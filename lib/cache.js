const { LRUCache } = require("lru-cache");

class MemoryCache {
  constructor(max = 500) {
    this.cache = new LRUCache({
      max
    });
  }

  async get(key) {
    const hit = this.cache.get(key);
    if (!hit) {
      return null;
    }
    if (hit.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return hit.value;
  }

  async set(key, value, ttlMs) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + Number(ttlMs || 0)
    });
  }
}

class RedisCache {
  constructor(client, prefix = "satapp:cache:") {
    this.client = client;
    this.prefix = prefix;
  }

  key(raw) {
    return `${this.prefix}${raw}`;
  }

  async get(key) {
    const raw = await this.client.get(this.key(key));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  async set(key, value, ttlMs) {
    const ttlSeconds = Math.max(1, Math.floor(Number(ttlMs || 0) / 1000));
    await this.client.setEx(this.key(key), ttlSeconds, JSON.stringify(value));
  }
}

async function createCache() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return {
      provider: "memory",
      cache: new MemoryCache()
    };
  }

  try {
    const { createClient } = require("redis");
    const client = createClient({ url: redisUrl });
    client.on("error", (error) => {
      console.warn("[cache] redis error:", error.message);
    });
    await client.connect();
    return {
      provider: "redis",
      cache: new RedisCache(client)
    };
  } catch (error) {
    console.warn("[cache] redis unavailable, fallback to memory:", error.message);
    return {
      provider: "memory",
      cache: new MemoryCache()
    };
  }
}

module.exports = {
  createCache
};
