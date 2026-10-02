const { randomUUID } = require('node:crypto');

// One provider-wide lease preserves weekly attempt limits across Vercel instances.
class OrbitalStore {
  constructor({ url, token, fetchImpl = fetch, prefix = 'satapp:celestrak:v1' }) {
    if (!url || !token) throw new Error('Connect an Upstash Redis database for orbital storage');
    this.url = url.replace(/\/$/, '');
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.key = prefix;
    this.lockKey = `${prefix}:lock`;
  }
  async command(...args) {
    const response = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Orbital storage is unavailable');
    const body = await response.json();
    if (body.error) throw new Error('Orbital storage command failed');
    return body.result;
  }
  read() {
    return this.command('GET', this.key);
  }
  async write(value) {
    const saved = await this.command(
      'EVAL',
      "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[2], ARGV[2]); return 1 else return 0 end",
      2,
      this.lockKey,
      this.key,
      this.lease,
      value,
    );
    if (saved !== 1) throw new Error('Orbital storage lease expired');
  }
  async runExclusive(work) {
    const lease = randomUUID();
    const deadline = Date.now() + 20000;
    for (;;) {
      if (await this.command('SET', this.lockKey, lease, 'NX', 'PX', 60000)) break;
      if (Date.now() >= deadline) throw new Error('Orbital storage is busy; try again shortly');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    this.lease = lease;
    try {
      return await work();
    } finally {
      this.lease = null;
      await this.command(
        'EVAL',
        "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
        1,
        this.lockKey,
        lease,
      ).catch(() => {});
    }
  }
}
module.exports = { OrbitalStore };
