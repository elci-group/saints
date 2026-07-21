const RESEARCH_STAGES = [
  ["scope", "Scope evidence gap"],
  ["discover", "Discover authorised sources"],
  ["corroborate", "Corroborate independent claims"],
  ["synthesise", "Synthesise provisional candidates"],
  ["review", "Queue analyst review"]
];

const SOURCE_TRUST = {
  "official match report": 0.92,
  "licensed event feed": 0.9,
  "analyst-linked video": 0.86,
  "youtube data api metadata": 0.68,
  "existing provenance": 0.62
};

function assertPacket(packet) {
  if (!packet?.gap?.fixtureId || packet.task !== "goalkeeper-evidence-collation") {
    throw new Error("A goalkeeper evidence collation packet is required");
  }
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function uniqueBy(items, keyOf) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function suggestionSignature(suggestion) {
  if (!suggestion) return null;
  return [suggestion.minute ?? "", suggestion.situation ?? "", suggestion.shotOrigin ?? "", suggestion.goalZone ?? ""]
    .map((value) => String(value).trim().toLowerCase())
    .join("|");
}

function normalizeItem(item, source) {
  const sourceType = cleanText(item?.sourceType ?? source.sourceType ?? "existing provenance").toLowerCase();
  const suggestion = item?.suggestion && typeof item.suggestion === "object" ? { ...item.suggestion } : null;
  return {
    sourceId: cleanText(source.id) ?? "unnamed-source",
    sourceLabel: cleanText(source.label) ?? cleanText(source.id) ?? "Unnamed source",
    sourceType,
    trust: Math.max(0, Math.min(1, Number(item?.trust ?? source.trust ?? SOURCE_TRUST[sourceType] ?? 0.5))),
    evidenceUrl: cleanText(item?.evidenceUrl),
    summary: cleanText(item?.summary),
    clip: item?.clip ?? null,
    suggestion,
    observed: false,
    provisional: true
  };
}

function scoreCandidate(item, corroboration) {
  const fields = ["minute", "situation", "shotOrigin", "goalZone"];
  const completeness = fields.filter((field) => item.suggestion?.[field] != null && item.suggestion[field] !== "").length / fields.length;
  return Math.min(0.95, item.trust * 0.62 + completeness * 0.23 + Math.min(corroboration - 1, 2) * 0.075);
}

export function createCompoundResearchPlan(packet) {
  assertPacket(packet);
  return {
    agent: "goblin-compound-research",
    objective: `Reconcile ${packet.gap.type} evidence for ${packet.gap.goalkeeper} against ${packet.gap.opponent}`,
    query: packet.gap.query,
    stages: RESEARCH_STAGES.map(([id, label]) => ({ id, label })),
    constraints: packet.constraints
  };
}

export function createExistingEvidenceSource() {
  return {
    id: "existing-provenance",
    label: "Existing fixture provenance",
    sourceType: "existing provenance",
    trust: 0.62,
    async collect({ packet }) {
      if (!packet.gap.evidenceUrl) return { items: [], clips: [] };
      return {
        items: [{
          evidenceUrl: packet.gap.evidenceUrl,
          summary: "Existing fixture or goalkeeper evidence reference; requires claim-level review."
        }],
        clips: []
      };
    }
  };
}

export async function runCompoundResearch(packet, { sources = [], now = () => new Date().toISOString() } = {}) {
  const plan = createCompoundResearchPlan(packet);
  const settled = await Promise.allSettled(sources.map(async (source) => {
    if (!source?.id || typeof source.collect !== "function") throw new Error("Research sources require id and collect");
    const result = await source.collect({ packet, plan });
    return { source, result: result ?? {} };
  }));

  const sourceRuns = settled.map((run, index) => run.status === "fulfilled"
    ? {
        id: run.value.source.id,
        label: run.value.source.label ?? run.value.source.id,
        status: "completed",
        itemCount: run.value.result.items?.length ?? 0,
        clipCount: run.value.result.clips?.length ?? 0
      }
    : {
        id: sources[index]?.id ?? `source-${index + 1}`,
        label: sources[index]?.label ?? sources[index]?.id ?? `Source ${index + 1}`,
        status: "failed",
        error: run.reason?.message ?? String(run.reason),
        itemCount: 0,
        clipCount: 0
      });

  const evidence = settled.flatMap((run) => run.status === "fulfilled"
    ? (run.value.result.items ?? []).map((item) => normalizeItem(item, run.value.source))
    : []);
  const clips = uniqueBy(settled.flatMap((run) => run.status === "fulfilled" ? (run.value.result.clips ?? []) : []),
    (clip) => clip.videoId ?? clip.url);
  const signatureCounts = new Map();
  evidence.forEach((item) => {
    const signature = suggestionSignature(item.suggestion);
    if (signature) signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
  });
  const candidates = evidence.filter((item) => item.suggestion).map((item) => {
    const corroboration = signatureCounts.get(suggestionSignature(item.suggestion)) ?? 1;
    return { ...item, corroboration, confidence: scoreCandidate(item, corroboration) };
  }).sort((a, b) => b.confidence - a.confidence);
  const top = candidates[0] ?? null;
  const trajectoryFields = packet.constraints?.trajectoryFields ?? ["minute", "situation", "shotOrigin", "goalZone"];
  const unresolvedFields = trajectoryFields.filter((field) => top?.suggestion?.[field] == null || top.suggestion[field] === "");
  const failedSources = sourceRuns.filter((source) => source.status === "failed").length;
  const status = top ? "review_required" : evidence.length || clips.length ? "evidence_collected" : "blocked";

  return {
    agent: plan.agent,
    schemaVersion: 1,
    runId: `${packet.gap.id ?? packet.gap.fixtureId}:${now()}`,
    status,
    provisional: true,
    observed: false,
    suggestion: top ? { ...top.suggestion, confidence: top.confidence } : null,
    confidence: top?.confidence ?? 0,
    unresolvedFields,
    clips,
    candidates,
    evidence,
    sourceRuns,
    trace: [
      { stage: "scope", status: "completed", detail: plan.objective },
      { stage: "discover", status: failedSources ? "degraded" : "completed", detail: `${sourceRuns.length - failedSources}/${sourceRuns.length} sources completed` },
      { stage: "corroborate", status: "completed", detail: `${candidates.length} structured candidates; ${clips.length} unique clips` },
      { stage: "synthesise", status: top ? "completed" : "deferred", detail: top ? `${Math.round(top.confidence * 100)}% provisional confidence` : "No trajectory claim promoted" },
      { stage: "review", status: "pending", detail: "Analyst confirmation is required before observed or validated status" }
    ],
    constraints: packet.constraints
  };
}
