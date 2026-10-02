const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { twoline2satrec } = require('satellite.js');
const WEEK_MS = 7 * 86400000;
const GROUPS = new Set(['stations', 'amateur', 'starlink', 'weather', 'active', 'military']);
class CelestrakError extends Error {
  constructor(message, status = 503, metadata = {}) {
    super(message);
    this.status = status;
    this.metadata = metadata;
  }
}
function descriptor(kind, query) {
  if (!['elements', 'satcat'].includes(kind))
    throw new CelestrakError('Invalid CelesTrak resource', 400);
  const allowed = kind === 'elements' ? ['GROUP', 'CATNR', 'FORMAT'] : ['CATNR', 'FORMAT'];
  if (
    Object.keys(query).some((key) => !allowed.includes(key)) ||
    Object.values(query).some((value) => typeof value !== 'string')
  )
    throw new CelestrakError('Unsupported CelesTrak parameters', 400);
  const format = kind === 'elements' ? 'tle' : 'json';
  if (query.FORMAT !== undefined && query.FORMAT.toLowerCase() !== format)
    throw new CelestrakError('Unsupported CelesTrak format', 400);
  if (kind === 'elements' && query.GROUP && !query.CATNR && GROUPS.has(query.GROUP.toLowerCase())) {
    const group = query.GROUP.toLowerCase();
    return {
      key: `elements:group:${group}`,
      kind,
      query: { GROUP: group, FORMAT: format },
      url: `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`,
    };
  }
  if (
    !query.GROUP &&
    typeof query.CATNR === 'string' &&
    /^\d{1,9}$/.test(query.CATNR) &&
    Number(query.CATNR) > 0
  ) {
    const id = String(Number(query.CATNR));
    return {
      key: `${kind}:norad:${id}`,
      kind,
      query: { CATNR: id, FORMAT: format },
      url:
        kind === 'elements'
          ? `https://celestrak.org/NORAD/elements/gp.php?CATNR=${id}&FORMAT=tle`
          : `https://celestrak.org/satcat/records.php?CATNR=${id}&FORMAT=json`,
    };
  }
  throw new CelestrakError('Specify one supported GROUP or a positive NORAD catalog ID', 400);
}
function validateBody(item, body) {
  if (typeof body !== 'string' || !body.trim()) return false;
  if (item.kind === 'satcat') {
    try {
      const records = JSON.parse(body);
      return (
        Array.isArray(records) &&
        records.length > 0 &&
        records.every(
          (record) =>
            record &&
            typeof record === 'object' &&
            Number(record.NORAD_CAT_ID) === Number(item.query.CATNR),
        )
      );
    } catch {
      return false;
    }
  }
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let count = 0;
  for (let index = 0; index < lines.length; index++) {
    const first = lines[index];
    if (!first.startsWith('1 ')) {
      if (first.startsWith('2 ') || /<\/?(?:html|body|title)/i.test(first)) return false;
      continue;
    }
    const second = lines[++index];
    if (
      !second?.startsWith('2 ') ||
      first.length < 63 ||
      second.length < 63 ||
      first.slice(2, 7) !== second.slice(2, 7)
    )
      return false;
    if (item.query.CATNR && Number(first.slice(2, 7)) !== Number(item.query.CATNR)) return false;
    try {
      const sat = twoline2satrec(first, second);
      if (
        sat.error ||
        !Number.isFinite(sat.jdsatepoch) ||
        !Number.isFinite(sat.no) ||
        sat.no <= 0 ||
        !Number.isFinite(sat.ecco) ||
        sat.ecco < 0 ||
        sat.ecco >= 1 ||
        !Number.isFinite(sat.inclo)
      )
        return false;
    } catch {
      return false;
    }
    count++;
  }
  return count > 0;
}
async function readBody(response, maxBytes = 12 * 1024 * 1024) {
  if (Number(response.headers.get('content-length')) > maxBytes)
    throw new Error('Orbital response exceeds size limit');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('Orbital response exceeds size limit');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}
class CelestrakService {
  constructor({
    cacheDir = process.env.CELESTRAK_CACHE_DIR || path.join(__dirname, '..', '.cache', 'celestrak'),
    fetchImpl = (...args) => fetch(...args),
    now = Date.now,
    minIntervalMs = 1000,
    timeoutMs = 15000,
    store,
  } = {}) {
    this.store = store;
    this.file = path.join(cacheDir, 'cache.json');
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.minIntervalMs = minIntervalMs;
    this.timeoutMs = timeoutMs;
    this.state = { version: 1, blockedUntil: null, blockedReason: null, entries: {} };
    this.ready = this.load().catch((error) => {
      this.loadError = error;
      console.error(
        '[celestrak] durable cache unavailable; upstream requests disabled:',
        error.message,
      );
    });
    this.queue = Promise.resolve();
    this.inflight = new Map();
    this.lastRequestAt = 0;
    this.closed = false;
  }
  async load() {
    try {
      const raw = this.store ? await this.store.read() : await fs.readFile(this.file, 'utf8');
      if (raw === null) return;
      const saved = JSON.parse(raw);
      if (
        saved.version !== 1 ||
        !saved.entries ||
        typeof saved.entries !== 'object' ||
        Array.isArray(saved.entries) ||
        (saved.blockedUntil !== null && !Number.isFinite(saved.blockedUntil))
      )
        throw new Error('Invalid CelesTrak cache file');
      this.state.blockedUntil = saved.blockedUntil;
      this.state.entries = {};
      this.state.lastRequestAt = Number.isFinite(saved.lastRequestAt) ? saved.lastRequestAt : 0;
      this.state.blockedReason =
        typeof saved.blockedReason === 'string' ? saved.blockedReason : null;
      for (const [key, entry] of Object.entries(saved.entries)) {
        const item = descriptor(entry.kind, entry.query);
        if (
          item.key !== key ||
          !Number.isFinite(entry.nextAttemptAt) ||
          (entry.body && (!Number.isFinite(entry.updatedAt) || !validateBody(item, entry.body)))
        ) {
          throw new Error(
            'Invalid durable CelesTrak cache entry; upstream requests disabled to preserve retry limits',
          );
        }
        this.state.entries[key] = entry;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  async persist() {
    if (this.store) return this.store.write(JSON.stringify(this.state));
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, JSON.stringify(this.state), { mode: 0o600 });
      await fs.rename(temp, this.file);
    } finally {
      await fs.rm(temp, { force: true }).catch(() => {});
    }
  }
  get(kind, query) {
    let item;
    try {
      item = descriptor(kind, query);
    } catch (error) {
      return Promise.reject(error);
    }
    if (this.inflight.has(item.key)) return this.inflight.get(item.key);
    if (this.closed)
      return Promise.reject(new CelestrakError('Orbital cache service is shutting down'));
    if (this.inflight.size >= 64)
      return Promise.reject(new CelestrakError('Orbital cache is busy; try again later'));
    const task = this.queue.then(() =>
      this.store
        ? this.store.runExclusive(async () => {
            // Reload under the shared lease: another function may have refreshed or paused feeds.
            await this.ready;
            await this.load();
            this.loadError = null;
            return this.resolve(item);
          })
        : this.resolve(item),
    );
    this.queue = task.catch(() => {});
    const pending = task.finally(() => this.inflight.delete(item.key));
    this.inflight.set(item.key, pending);
    return pending;
  }
  metadata(entry, warning) {
    const now = this.now();
    const blockedUntil = this.state.blockedUntil > now ? this.state.blockedUntil : null;
    return {
      updatedAt: entry?.updatedAt ?? null,
      nextRefreshAt: Math.max(entry?.nextAttemptAt ?? now, blockedUntil ?? 0),
      blockedUntil,
      warning:
        warning ||
        (blockedUntil
          ? this.state.blockedReason ||
            'CelesTrak requests are paused after HTTP 403 or 429; retained data remains available.'
          : entry?.warning ||
            (entry?.updatedAt && now - entry.updatedAt >= WEEK_MS
              ? 'Using retained orbital data older than seven days.'
              : null)),
    };
  }
  result(entry, warning) {
    const metadata = this.metadata(entry, warning);
    if (!entry?.body)
      throw new CelestrakError(
        metadata.warning || 'Orbital data is not cached yet; the next attempt is scheduled.',
        503,
        metadata,
      );
    return {
      body: entry.body,
      contentType:
        entry.kind === 'elements' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
      ...metadata,
    };
  }
  async resolve(item) {
    await this.ready;
    if (this.loadError)
      throw new CelestrakError(
        'Durable orbital cache is unavailable; upstream requests are disabled.',
      );
    if (this.closed) throw new CelestrakError('Orbital cache service is shutting down');
    let entry = this.state.entries[item.key];
    const now = this.now();
    if (this.state.blockedUntil > now || entry?.nextAttemptAt > now) return this.result(entry);
    const previous = entry;
    entry = { ...entry, kind: item.kind, query: item.query, nextAttemptAt: now + WEEK_MS };
    this.state.entries[item.key] = entry;
    // Commit the attempt deadline before the network operation so crashes/restarts cannot retry it.
    try {
      await this.persist();
    } catch {
      return this.result(
        previous,
        'Orbital cache could not be saved; upstream refresh was skipped.',
      );
    }
    const wait =
      this.minIntervalMs -
      (Date.now() - Math.max(this.lastRequestAt, this.state.lastRequestAt || 0));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if (this.closed) return this.result(entry, 'Orbital refresh interrupted during shutdown.');
    this.lastRequestAt = Date.now();
    if (this.store) {
      this.state.lastRequestAt = this.lastRequestAt;
      try {
        await this.persist();
      } catch {
        return this.result(
          previous,
          'Orbital cache could not be saved; upstream refresh was skipped.',
        );
      }
    }
    const controller = new AbortController();
    this.activeController = controller;
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(item.url, {
        signal: controller.signal,
        redirect: 'error',
        headers: { 'User-Agent': 'Satellite-Sky-Tracker/1.0 (weekly shared cache)' },
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 403 || response.status === 429) {
          const retryRaw = response.headers.get('retry-after');
          const retry =
            retryRaw && /^\d+$/.test(retryRaw)
              ? now + Number(retryRaw) * 1000
              : Date.parse(retryRaw || '');
          this.state.blockedReason = `CelesTrak returned HTTP ${response.status}; requests are paused until the next weekly attempt.`;
          this.state.blockedUntil = Math.max(now + WEEK_MS, Number.isFinite(retry) ? retry : 0);
        }
        throw new Error(
          `CelesTrak returned HTTP ${response.status}; next attempt is limited to the weekly schedule.`,
        );
      }
      const body = await readBody(response);
      if (!validateBody(item, body))
        throw new Error(
          'CelesTrak returned invalid or empty orbital data; the last valid data was retained.',
        );
      const good = {
        ...entry,
        body,
        updatedAt: this.now(),
        nextAttemptAt: this.now() + WEEK_MS,
        warning: null,
      };
      this.state.entries[item.key] = good;
      try {
        await this.persist();
      } catch (error) {
        this.state.entries[item.key] = entry;
        throw new Error('Orbital refresh could not be saved; the last durable data was retained.');
      }
      return this.result(good);
    } catch (error) {
      entry.warning =
        error.name === 'AbortError'
          ? 'CelesTrak request timed out; the next attempt follows the weekly schedule.'
          : error.message;
      this.state.entries[item.key] = entry;
      await this.persist().catch(() => {});
      return this.result(entry);
    } finally {
      clearTimeout(timer);
      this.activeController = null;
    }
  }
  start() {
    if (this.timer || this.closed) return;
    // Only known keys, hourly due checks; never harvest catalogs at startup.
    this.timer = setInterval(
      () => this.refreshDue().catch((error) => console.warn('[celestrak]', error.message)),
      3600000,
    );
    this.timer.unref();
  }
  async refreshDue() {
    await this.ready;
    if (this.loadError || this.closed || this.state.blockedUntil > this.now()) return;
    for (const entry of Object.values(this.state.entries)) {
      if (this.loadError || this.closed || this.state.blockedUntil > this.now()) break;
      if (entry.nextAttemptAt <= this.now())
        await this.get(entry.kind, entry.query).catch(() => {});
    }
  }
  async close() {
    this.closed = true;
    clearInterval(this.timer);
    this.activeController?.abort();
    await this.queue;
  }
}
module.exports = { CelestrakService, CelestrakError, WEEK_MS, descriptor, validateBody };
