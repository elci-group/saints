const SVG_TEAM = "Saint Vincent and the Grenadines";

export function buildKeeperEvidenceGaps(fixtures, goalkeeper = null) {
  const gaps = [];
  for (const fixture of fixtures ?? []) {
    const analysis = fixture.goalkeeperAnalysis;
    if (!analysis?.goalkeeper || (goalkeeper && analysis.goalkeeper !== goalkeeper)) continue;
    const events = analysis.events ?? [];
    events.forEach((event, index) => {
      if (event.trajectoryObserved && event.shotOrigin && event.goalZone) return;
      gaps.push(makeGap(fixture, analysis, {
        id: `${fixture.id}-event-${index + 1}`,
        minute: event.minute ?? null,
        type: "trajectory",
        reason: "Attributed goal lacks a coded shot origin or goal zone",
        priority: event.minute == null ? 72 : 84
      }));
    });
    const missingGoals = Math.max(0, Number(fixture.goalsAgainst ?? 0) - events.length);
    for (let index = 0; index < missingGoals; index += 1) {
      gaps.push(makeGap(fixture, analysis, {
        id: `${fixture.id}-goal-${events.length + index + 1}`,
        minute: null,
        type: "event",
        reason: "Scoreline goal is not reconciled to a report event",
        priority: analysis.eventCoverage > 0.7 ? 76 : 92
      }));
    }
  }
  return gaps.sort((a, b) => b.priority - a.priority || b.date.localeCompare(a.date));
}

function makeGap(fixture, analysis, detail) {
  const year = String(fixture.date).slice(0, 4);
  return {
    ...detail,
    fixtureId: fixture.id,
    goalkeeper: analysis.goalkeeper,
    date: fixture.date,
    opponent: fixture.opponent,
    competition: fixture.competition,
    evidenceUrl: analysis.evidenceUrl ?? fixture.matchReportUrl ?? null,
    query: `${SVG_TEAM} vs ${fixture.opponent} ${year} highlights goals`
  };
}

export function buildGoblinCollationPacket(gap) {
  if (!gap?.fixtureId) throw new Error("A fixture evidence gap is required");
  return {
    task: "goalkeeper-evidence-collation",
    schemaVersion: 2,
    gap,
    constraints: {
      allowedSources: ["official match report", "licensed event feed", "analyst-linked video", "YouTube Data API metadata", "existing provenance"],
      neverInferAsObserved: true,
      requiredFields: ["goalkeeper", "date", "opponent", "outcome", "evidenceUrl"],
      trajectoryFields: ["minute", "situation", "shotOrigin", "goalZone"]
    },
    orchestration: {
      agent: "goblin-compound-research",
      stages: ["scope", "discover", "corroborate", "synthesise", "review"],
      parallelDiscovery: true,
      outputStatus: "provisional"
    }
  };
}

export async function searchYouTubeClips({ query, apiKey, fetchImpl = fetch, maxResults = 6 }) {
  if (!String(apiKey ?? "").trim()) throw new Error("A YouTube Data API key is required");
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    safeSearch: "strict",
    maxResults: String(Math.min(Math.max(maxResults, 1), 10)),
    q: query,
    key: apiKey.trim()
  });
  const response = await fetchImpl(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!response.ok) throw new Error(`YouTube search failed (${response.status})`);
  const payload = await response.json();
  return (payload.items ?? []).map((item) => ({
    videoId: item.id?.videoId,
    title: item.snippet?.title ?? "Untitled clip",
    channel: item.snippet?.channelTitle ?? "Unknown channel",
    publishedAt: item.snippet?.publishedAt ?? null,
    thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
    url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
    source: "youtube-data-api"
  })).filter((clip) => clip.videoId);
}

export async function searchYouTubeChannelClips({ query, handle, apiKey, fetchImpl = fetch, maxResults = 6 }) {
  if (!String(apiKey ?? "").trim()) throw new Error("A YouTube Data API key is required");
  const channelParams = new URLSearchParams({ part: "id,snippet", forHandle: handle.replace(/^@/, ""), key: apiKey.trim() });
  const channelResponse = await fetchImpl(`https://www.googleapis.com/youtube/v3/channels?${channelParams}`);
  const channelPayload = await channelResponse.json();
  const channelId = channelPayload.items?.[0]?.id;
  if (!channelResponse.ok || !channelId) throw new Error("The requested official YouTube channel could not be resolved");
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    safeSearch: "strict",
    maxResults: String(Math.min(Math.max(maxResults, 1), 10)),
    channelId,
    q: query,
    key: apiKey.trim()
  });
  const response = await fetchImpl(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!response.ok) throw new Error(`YouTube search failed (${response.status})`);
  const payload = await response.json();
  return (payload.items ?? []).map((item) => ({
    videoId: item.id?.videoId,
    title: item.snippet?.title ?? "Untitled clip",
    channel: item.snippet?.channelTitle ?? handle,
    publishedAt: item.snippet?.publishedAt ?? null,
    thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
    url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
    source: "concacaf-youtube",
    official: true
  })).filter((clip) => clip.videoId);
}

export function validVideoUrl(value) {
  try {
    const url = new URL(value);
    return ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeVideoSuggestion(suggestion) {
  const allowedSituations = new Set(["open-play", "penalty", "set-piece", "counterattack"]);
  const normalized = {
    minute: Number.isFinite(Number(suggestion?.minute)) ? Number(suggestion.minute) : null,
    situation: allowedSituations.has(suggestion?.situation) ? suggestion.situation : "open-play",
    shotOrigin: String(suggestion?.shotOrigin ?? "").trim(),
    goalZone: String(suggestion?.goalZone ?? "").trim(),
    confidence: Math.max(0, Math.min(1, Number(suggestion?.confidence ?? 0)))
  };
  if (!normalized.shotOrigin || !normalized.goalZone) throw new Error("The model suggestion needs a shot origin and goal zone");
  return normalized;
}
