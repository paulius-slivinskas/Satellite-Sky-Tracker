const express = require('express');
const path = require('node:path');
const { createCache } = require('./lib/cache');
const { RadioService, SatnogsError } = require('./services/radioService');
const { CelestrakService, CelestrakError } = require('./services/celestrakService');

function createApp({
  radioService,
  celestrakService,
  distDir = path.join(__dirname, 'dist'),
  publicDir = path.join(__dirname, 'public'),
} = {}) {
  if (!radioService) throw new TypeError('createApp requires a radioService');
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/sat/:norad/radio', async (req, res) => {
    const noradRaw = String(req.params.norad || '');
    const norad = Number(noradRaw);
    if (!/^\d+$/.test(noradRaw) || !Number.isSafeInteger(norad) || norad <= 0) {
      res
        .status(400)
        .json({ error: 'Invalid NORAD catalog id. Expected a positive, safe integer in path.' });
      return;
    }
    try {
      res.json(await radioService.getUnifiedRadioByNorad(String(norad)));
    } catch (error) {
      if (error instanceof SatnogsError) {
        res.status(502).json({ error: 'SatNOGS fetch failed', detail: error.message });
        return;
      }
      console.error('[api] unexpected error:', error);
      res.status(500).json({ error: 'Unexpected server error' });
    }
  });

  const metadataHeaders = (res, metadata) => {
    for (const [key, header] of [
      ['updatedAt', 'X-Celestrak-Updated-At'],
      ['nextRefreshAt', 'X-Celestrak-Next-Refresh-At'],
      ['blockedUntil', 'X-Celestrak-Blocked-Until'],
    ]) {
      if (Number.isFinite(metadata[key])) res.set(header, new Date(metadata[key]).toISOString());
    }
    if (metadata.warning) res.set('X-Celestrak-Warning', metadata.warning);
    res.set('Cache-Control', 'no-store');
  };
  for (const resource of ['elements', 'satcat'])
    app.get(`/api/celestrak/${resource}`, async (req, res) => {
      try {
        if (!celestrakService) throw new CelestrakError('Orbital cache service is unavailable');
        const result = await celestrakService.get(resource, req.query);
        metadataHeaders(res, result);
        res.type(result.contentType).send(result.body);
      } catch (error) {
        metadataHeaders(res, error.metadata || {});
        res.status(error instanceof CelestrakError ? error.status : 503).json({
          error:
            error instanceof CelestrakError
              ? error.message
              : 'Orbital cache service is unavailable',
        });
      }
    });

  // Only deliberately published assets are public; never serve the repository root.
  app.use(express.static(distDir, { dotfiles: 'deny' }));
  app.use(express.static(publicDir, { dotfiles: 'deny' }));
  return app;
}

async function main() {
  const port = Number(process.env.PORT || 8080);
  const cacheInit = await createCache();
  const celestrakService = new CelestrakService();
  await celestrakService.ready;
  celestrakService.start();
  const app = createApp({ radioService: new RadioService(cacheInit.cache), celestrakService });
  console.log(`[server] cache provider: ${cacheInit.provider}`);
  const server = app.listen(port, () =>
    console.log(`[server] listening on http://localhost:${port}`),
  );
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const forcedClose = setTimeout(() => server.closeAllConnections(), 5000);
    forcedClose.unref();
    await new Promise((resolve) => server.close(resolve));
    clearTimeout(forcedClose);
    await celestrakService.close();
    await cacheInit.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.once('error', async (error) => {
    console.error('[server] startup failed:', error);
    await celestrakService.close();
    await cacheInit.close();
    process.exitCode = 1;
  });
  return { app, server, shutdown };
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[server] startup failed:', error);
    process.exitCode = 1;
  });
}

module.exports = { createApp, main };
