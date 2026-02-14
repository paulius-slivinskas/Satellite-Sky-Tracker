const express = require("express");
const path = require("node:path");
const { createCache } = require("./lib/cache");
const { RadioService, SatnogsError } = require("./services/radioService");

async function main() {
  const app = express();
  const port = Number(process.env.PORT || 8080);

  const cacheInit = await createCache();
  const radioService = new RadioService(cacheInit.cache);
  console.log(`[server] cache provider: ${cacheInit.provider}`);

  app.get("/api/sat/:norad/radio", async (req, res) => {
    const noradRaw = String(req.params.norad || "").trim();
    if (!/^\d+$/.test(noradRaw)) {
      res.status(400).json({
        error: "Invalid NORAD catalog id. Expected numeric value in path."
      });
      return;
    }

    try {
      const payload = await radioService.getUnifiedRadioByNorad(noradRaw);
      res.json(payload);
    } catch (error) {
      if (error instanceof SatnogsError) {
        res.status(502).json({
          error: "SatNOGS fetch failed",
          detail: error.message
        });
        return;
      }
      console.error("[api] unexpected error:", error);
      res.status(500).json({
        error: "Unexpected server error"
      });
    }
  });

  app.use(express.static(path.join(__dirname)));

  app.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error("[server] startup failed:", error);
  process.exit(1);
});
