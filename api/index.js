const { createApp } = require('../server');
const { createCache } = require('../lib/cache');
const { OrbitalStore } = require('../lib/orbitalStore');
const { RadioService } = require('../services/radioService');
const { CelestrakService } = require('../services/celestrakService');

let initialization;
async function initialize() {
  const store = new OrbitalStore({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  const { cache } = await createCache();
  const celestrakService = new CelestrakService({ store });
  await celestrakService.ready;
  // Refresh on demand; serverless instances do not run persistent background timers.
  return createApp({ radioService: new RadioService(cache), celestrakService });
}
module.exports = async (req, res) => {
  try {
    initialization ??= initialize().catch((error) => {
      initialization = null;
      throw error;
    });
    const app = await initialization;
    // Vercel injects the rewrite capture into the query; it is not an upstream parameter.
    const url = new URL(req.url, 'http://localhost');
    url.searchParams.delete('__vercelPath');
    req.url = `${url.pathname}${url.search}`;
    if (req.query) delete req.query.__vercelPath;
    return app(req, res);
  } catch {
    res.status(503).json({ error: 'API storage is not configured or is unavailable.' });
  }
};
