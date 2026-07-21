const requiredScopeFields = ["domain", "competition", "team"];

export class PadagoniaContextArray {
  constructor(records = []) {
    this.records = [];
    this.keys = new Set();
    this.addMany(records);
  }

  addMany(records) {
    for (const record of records) this.add(record);
  }

  add(record) {
    if (!record?.source || !record?.metric || !record?.scope) return false;
    if (!requiredScopeFields.every((field) => record.scope[field])) return false;
    const normalized = {
      id: record.id ?? crypto.randomUUID(),
      eventId: record.eventId ?? "aggregate",
      player: record.scope.player ?? null,
      observedAt: record.observedAt ?? new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      unit: record.unit ?? null,
      evidenceUrl: record.evidenceUrl ?? null,
      ...record,
      scope: { ...record.scope, player: record.scope.player ?? null }
    };
    const key = [normalized.source, normalized.eventId, normalized.metric, normalized.scope.domain,
      normalized.scope.competition, normalized.scope.team, normalized.scope.player ?? "team"].join("|");
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    this.records.push(normalized);
    return true;
  }

  query(scope = {}) {
    return this.records.filter((record) => Object.entries(scope).every(([key, value]) => {
      if (key === "player") return record.scope.player === value;
      if (value == null) return true;
      return record.scope[key] === value;
    }));
  }
}

export class JitContextCache {
  constructor(prefix, staleWhileRevalidateMs = 86400000) {
    this.prefix = prefix;
    this.staleWhileRevalidateMs = staleWhileRevalidateMs;
    this.memory = new Map();
  }

  read(key) {
    const storageKey = `${this.prefix}:${key}`;
    let entry = this.memory.get(storageKey);
    if (!entry) {
      try { entry = JSON.parse(localStorage.getItem(storageKey)); } catch { entry = null; }
    }
    if (!entry) return { hit: false };
    const ageMs = Date.now() - entry.storedAt;
    return { hit: true, stale: ageMs > entry.ttlMs, usable: ageMs <= entry.ttlMs + this.staleWhileRevalidateMs, ageMs, value: entry.value };
  }

  write(key, value, ttlMs) {
    const storageKey = `${this.prefix}:${key}`;
    const entry = { storedAt: Date.now(), ttlMs, value };
    this.memory.set(storageKey, entry);
    try { localStorage.setItem(storageKey, JSON.stringify(entry)); } catch { /* memory cache remains available */ }
  }
}

export class ContextBroker {
  constructor(config, records = []) {
    this.config = config;
    this.store = new PadagoniaContextArray(records);
    this.cache = new JitContextCache(config.cache.prefix, config.cache.staleWhileRevalidateMs);
    this.adapters = new Map();
    this.lastRun = new Map();
    this.failures = new Map();
  }

  register(sourceId, adapter) {
    this.adapters.set(sourceId, adapter);
  }

  ingest(records) {
    this.store.addMany(records);
  }

  async contextualize(scope, { force = false } = {}) {
    const cacheKey = [scope.domain, scope.competition, scope.team, scope.player ?? "team", scope.venue ?? "anywhere"].join(":");
    const cached = this.cache.read(cacheKey);
    if (!force && cached.hit && !cached.stale) return { ...cached.value, cache: { state: "fresh", ageMs: cached.ageMs } };

    const statuses = [];
    for (const source of this.config.sources) {
      const adapter = this.adapters.get(source.id);
      if (!adapter) {
        statuses.push({ source: source.id, state: source.access === "api" ? "not-configured" : "policy-gated", records: 0 });
        continue;
      }
      const sourceCacheKey = `${cacheKey}:${source.id}`;
      const sourceCached = this.cache.read(sourceCacheKey);
      if (!force && sourceCached.hit && !sourceCached.stale) {
        const records = sourceCached.value ?? [];
        this.store.addMany(records);
        statuses.push({ source: source.id, state: records.length ? "cached" : "empty", records: records.length });
        continue;
      }
      const sinceLastRun = Date.now() - (this.lastRun.get(source.id) ?? 0);
      if (!force && sinceLastRun < source.minIntervalMs) {
        statuses.push({ source: source.id, state: "rate-limited", records: 0 });
        continue;
      }
      try {
        this.lastRun.set(source.id, Date.now());
        const records = await adapter(scope, source);
        this.store.addMany(records ?? []);
        this.cache.write(sourceCacheKey, records ?? [], source.ttlMs);
        this.failures.set(source.id, 0);
        statuses.push({ source: source.id, state: records?.length ? "loaded" : "empty", records: records?.length ?? 0 });
      } catch (error) {
        const failures = (this.failures.get(source.id) ?? 0) + 1;
        this.failures.set(source.id, failures);
        statuses.push({ source: source.id, state: failures >= 3 ? "circuit-open" : "failed", records: 0, error: error.message });
      }
    }

    const records = this.store.query(scope);
    const consensus = buildConsensus(records, this.config);
    const value = { scope, records, consensus, statuses, generatedAt: new Date().toISOString() };
    const ttlMs = Math.min(...this.config.sources.map((source) => source.ttlMs));
    this.cache.write(cacheKey, value, ttlMs);
    return { ...value, cache: { state: cached.hit && cached.usable ? "revalidated" : "miss", ageMs: 0 } };
  }
}

export function buildConsensus(records, config) {
  const sourceMap = new Map(config.sources.map((source) => [source.id, source]));
  const groups = new Map();
  for (const record of records) {
    const key = `${record.eventId}|${record.metric}|${record.scope.player ?? "team"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  const points = [];
  const discrepancies = [];
  for (const [key, claims] of groups) {
    const numericClaims = claims.filter((claim) => Number.isFinite(Number(claim.value)));
    if (!numericClaims.length) continue;
    const weighted = numericClaims.map((claim) => {
      const source = sourceMap.get(claim.source);
      const family = claim.metricFamily ?? "result";
      return { ...claim, weight: source?.metricTrust?.[family] ?? source?.baseTrust ?? .5 };
    });
    const value = weightedMedian(weighted.map((claim) => ({ value: Number(claim.value), weight: claim.weight })));
    const spread = Math.max(...weighted.map((claim) => Number(claim.value))) - Math.min(...weighted.map((claim) => Number(claim.value)));
    const metric = weighted[0].metric;
    const tolerance = config.tolerances[metric] ?? Math.max(Math.abs(value) * .08, .5);
    const status = weighted.length < 2 ? "provisional" : spread <= tolerance ? "validated" : "disputed";
    const confidence = Math.min(1, weighted.reduce((sum, claim) => sum + claim.weight, 0) / 2.5) * (status === "disputed" ? .55 : 1);
    const point = { key, eventId: weighted[0].eventId, metric, value, spread, tolerance, status, confidence, sources: weighted.map((claim) => claim.source) };
    points.push(point);
    if (status === "disputed") discrepancies.push({ ...point, claims: weighted.map((claim) => ({ source: claim.source, value: claim.value })) });
  }
  return {
    points,
    discrepancies,
    validated: points.filter((point) => point.status === "validated").length,
    provisional: points.filter((point) => point.status === "provisional").length,
    disputed: discrepancies.length,
    confidence: points.length ? points.reduce((sum, point) => sum + point.confidence, 0) / points.length : 0
  };
}

function weightedMedian(values) {
  const ordered = [...values].sort((a, b) => a.value - b.value);
  const half = ordered.reduce((sum, item) => sum + item.weight, 0) / 2;
  let cursor = 0;
  for (const item of ordered) {
    cursor += item.weight;
    if (cursor >= half) return item.value;
  }
  return ordered.at(-1)?.value ?? 0;
}
