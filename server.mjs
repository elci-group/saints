import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createExistingEvidenceSource, runCompoundResearch } from "./goblin-agent.js";

const DEFAULT_ROOT = fileURLToPath(new URL(".", import.meta.url));
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const CONCACAF_HANDLE = "concacaf";
const CONCACAF_CHANNEL_URL = "https://www.youtube.com/concacaf";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const ACTION_SCHEMA = {
  name: "goalkeeper_action_candidates",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      records: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            clipTimeSeconds: { type: "number", minimum: 0 },
            matchMinute: { type: ["number", "null"], minimum: 0, maximum: 130 },
            outcome: { type: "string", enum: ["conceded", "saved", "saved-retaken", "unknown"] },
            situation: { type: "string", enum: ["open-play", "penalty", "set-piece", "counterattack", "unknown"] },
            shotOrigin: { type: ["string", "null"] },
            goalZone: { type: ["string", "null"] },
            commentaryEvidence: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          },
          required: ["clipTimeSeconds", "matchMinute", "outcome", "situation", "shotOrigin", "goalZone", "commentaryEvidence", "confidence"]
        }
      }
    },
    required: ["records"]
  }
};

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Request body exceeds the configured limit");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function groqRequest(path, body, { apiKey, fetchImpl }) {
  if (!apiKey) {
    const error = new Error("GROQ_API_KEY is not configured on the AVI server");
    error.status = 503;
    throw error;
  }
  const response = await fetchImpl(`https://api.groq.com/openai/v1/${path}`, {
    method: "POST",
    headers: body instanceof FormData ? { authorization: `Bearer ${apiKey}` } : {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: body instanceof FormData ? body : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message ?? `Groq request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function transcribeWithGroq(buffer, {
  apiKey,
  fetchImpl = fetch,
  filename = "broadcast.mp4",
  contentType = "video/mp4",
  model = "whisper-large-v3-turbo"
} = {}) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }), filename);
  form.append("model", model);
  form.append("language", "en");
  form.append("temperature", "0");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("prompt", "Football match commentary. Preserve player, team, venue, score and minute names accurately.");
  return groqRequest("audio/transcriptions", form, { apiKey, fetchImpl });
}

export async function inferActionsFromTranscript(input, {
  apiKey,
  fetchImpl = fetch,
  model = "openai/gpt-oss-20b"
} = {}) {
  const transcript = String(input?.transcript ?? "").trim();
  if (!transcript) {
    const error = new Error("A commentary transcript is required");
    error.status = 400;
    throw error;
  }
  const payload = await groqRequest("chat/completions", {
    model,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: "Extract possible goalkeeper action records from timestamped football commentary. Never invent direction, origin, outcome, or minute. Use null or unknown when commentary does not state it. Confidence measures commentary support only. Every result is provisional and requires analyst confirmation."
      },
      {
        role: "user",
        content: JSON.stringify({
          fixture: input.fixture ?? null,
          transcript,
          segments: input.segments ?? []
        })
      }
    ],
    response_format: { type: "json_schema", json_schema: ACTION_SCHEMA }
  }, { apiKey, fetchImpl });
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned no structured action records");
  return { ...JSON.parse(content), model, provisional: true };
}

export async function searchConcacafYoutube(query, {
  apiKey,
  fetchImpl = fetch,
  maxResults = 8,
  channelCache = new Map()
} = {}) {
  if (!apiKey) {
    const error = new Error("YOUTUBE_DATA_API_KEY is not configured on the AVI server");
    error.status = 503;
    throw error;
  }
  let channelId = channelCache.get(CONCACAF_HANDLE);
  if (!channelId) {
    const params = new URLSearchParams({ part: "id,snippet", forHandle: CONCACAF_HANDLE, key: apiKey });
    const response = await fetchImpl(`https://www.googleapis.com/youtube/v3/channels?${params}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.items?.[0]?.id) throw new Error("The official Concacaf YouTube channel could not be resolved");
    channelId = payload.items[0].id;
    channelCache.set(CONCACAF_HANDLE, channelId);
  }
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    safeSearch: "strict",
    order: "relevance",
    maxResults: String(Math.min(Math.max(maxResults, 1), 10)),
    channelId,
    q: query,
    key: apiKey
  });
  const response = await fetchImpl(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? `YouTube search failed (${response.status})`);
  return {
    source: { id: "concacaf-youtube", label: "Concacaf YouTube", channelId, handle: `@${CONCACAF_HANDLE}`, url: CONCACAF_CHANNEL_URL },
    clips: (payload.items ?? []).map((item) => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title ?? "Untitled clip",
      channel: item.snippet?.channelTitle ?? "Concacaf",
      publishedAt: item.snippet?.publishedAt ?? null,
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
      url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      source: "concacaf-youtube",
      official: true
    })).filter((clip) => clip.videoId)
  };
}

export async function researchGoblinPacket(packet, {
  env = process.env,
  fetchImpl = fetch,
  channelCache = new Map(),
  goblinSources = []
} = {}) {
  const officialVideoSource = {
    id: "concacaf-youtube",
    label: "Concacaf official YouTube",
    sourceType: "YouTube Data API metadata",
    trust: 0.68,
    async collect({ packet: collationPacket }) {
      const result = await searchConcacafYoutube(collationPacket.gap.query, {
        apiKey: env.YOUTUBE_DATA_API_KEY,
        fetchImpl,
        channelCache
      });
      return {
        clips: result.clips,
        items: result.clips.map((clip) => ({
          evidenceUrl: clip.url,
          clip,
          summary: `Official channel metadata candidate: ${clip.title}`
        }))
      };
    }
  };
  return runCompoundResearch(packet, {
    sources: [createExistingEvidenceSource(), officialVideoSource, ...goblinSources]
  });
}

async function serveStatic(request, response, root) {
  const url = new URL(request.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = resolve(root, `.${normalize(pathname)}`);
  if (!filePath.startsWith(`${resolve(root)}/`) || !existsSync(filePath) || !(await stat(filePath)).isFile()) {
    json(response, 404, { error: "Not found" });
    return;
  }
  const info = await stat(filePath);
  response.writeHead(200, {
    "content-type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
    "content-length": info.size,
    "cache-control": extname(filePath) === ".json" ? "no-cache" : "public, max-age=300"
  });
  createReadStream(filePath).pipe(response);
}

export function createAviServer({ root = DEFAULT_ROOT, env = process.env, fetchImpl = fetch, goblinSources = [] } = {}) {
  const channelCache = new Map();
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/favicon.ico") {
        response.writeHead(204, { "cache-control": "public, max-age=86400" });
        response.end();
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        json(response, 200, {
          ok: true,
          services: { groq: Boolean(env.GROQ_API_KEY), youtube: Boolean(env.YOUTUBE_DATA_API_KEY) },
          models: { stt: env.GROQ_STT_MODEL ?? "whisper-large-v3-turbo", inference: env.GROQ_INFERENCE_MODEL ?? "openai/gpt-oss-20b" },
          agents: { goblin: { mode: "compound-research", stages: 5, analystReviewRequired: true } },
          evidenceSources: [{ id: "concacaf-youtube", handle: "@concacaf", url: CONCACAF_CHANNEL_URL }]
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/goblin/research") {
        const packet = JSON.parse((await readBody(request, 1024 * 1024)).toString("utf8"));
        const result = await researchGoblinPacket(packet, { env, fetchImpl, channelCache, goblinSources });
        return json(response, 200, result);
      }
      if (request.method === "GET" && url.pathname === "/api/youtube/search") {
        const query = url.searchParams.get("q")?.trim();
        if (!query) return json(response, 400, { error: "Search query is required" });
        const result = await searchConcacafYoutube(query, { apiKey: env.YOUTUBE_DATA_API_KEY, fetchImpl, channelCache });
        return json(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/api/stt") {
        const contentLength = Number(request.headers["content-length"] ?? 0);
        if (contentLength > MAX_AUDIO_BYTES) return json(response, 413, { error: "Media exceeds the 25 MB upload limit" });
        const buffer = await readBody(request, MAX_AUDIO_BYTES);
        const result = await transcribeWithGroq(buffer, {
          apiKey: env.GROQ_API_KEY,
          fetchImpl,
          filename: request.headers["x-file-name"] ?? "broadcast.mp4",
          contentType: request.headers["content-type"] ?? "video/mp4",
          model: env.GROQ_STT_MODEL ?? "whisper-large-v3-turbo"
        });
        return json(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/api/infer-actions") {
        const body = JSON.parse((await readBody(request, 2 * 1024 * 1024)).toString("utf8"));
        const result = await inferActionsFromTranscript(body, {
          apiKey: env.GROQ_API_KEY,
          fetchImpl,
          model: env.GROQ_INFERENCE_MODEL ?? "openai/gpt-oss-20b"
        });
        return json(response, 200, result);
      }
      if (request.method === "GET" || request.method === "HEAD") return serveStatic(request, response, root);
      return json(response, 405, { error: "Method not allowed" });
    } catch (error) {
      json(response, error.status ?? 500, { error: error.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8081);
  const host = process.env.HOST ?? "127.0.0.1";
  createAviServer().listen(port, host, () => {
    process.stdout.write(`AVI server listening on http://${host}:${port}\n`);
  });
}
