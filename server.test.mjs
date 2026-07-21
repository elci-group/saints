import assert from "node:assert/strict";
import { inferActionsFromTranscript, researchGoblinPacket, searchConcacafYoutube, transcribeWithGroq } from "./server.mjs";
import { buildGoblinCollationPacket } from "./keeper-ingress.js";

let transcriptionForm;
const transcription = await transcribeWithGroq(Buffer.from("media"), {
  apiKey: "groq-test",
  filename: "match.mp4",
  fetchImpl: async (_url, options) => {
    transcriptionForm = options.body;
    return new Response(JSON.stringify({ text: "Goal for SVG", segments: [{ start: 5, text: "Goal for SVG" }] }), { status: 200 });
  }
});
assert.equal(transcription.text, "Goal for SVG");
assert.equal(transcriptionForm.get("model"), "whisper-large-v3-turbo");
assert.equal(transcriptionForm.get("response_format"), "verbose_json");

let inferenceBody;
const inferred = await inferActionsFromTranscript({ transcript: "[00:05] Low shot into the right corner." }, {
  apiKey: "groq-test",
  fetchImpl: async (_url, options) => {
    inferenceBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ records: [{ clipTimeSeconds: 5, matchMinute: null, outcome: "conceded", situation: "unknown", shotOrigin: null, goalZone: "Low right", commentaryEvidence: "Low shot into the right corner", confidence: 0.72 }] }) } }]
    }), { status: 200 });
  }
});
assert.equal(inferenceBody.response_format.json_schema.strict, true);
assert.equal(inferenceBody.model, "openai/gpt-oss-20b");
assert.equal(inferred.records[0].goalZone, "Low right");
assert.equal(inferred.provisional, true);

const requested = [];
const youtube = await searchConcacafYoutube("SVG Grenada", {
  apiKey: "youtube-test",
  fetchImpl: async (url) => {
    requested.push(url);
    if (url.includes("/channels?")) return new Response(JSON.stringify({ items: [{ id: "UC-CONCACAF" }] }), { status: 200 });
    return new Response(JSON.stringify({ items: [{ id: { videoId: "video-1" }, snippet: { title: "Highlights", channelTitle: "Concacaf" } }] }), { status: 200 });
  }
});
assert.match(requested[0], /forHandle=concacaf/);
assert.match(requested[1], /channelId=UC-CONCACAF/);
assert.equal(youtube.source.handle, "@concacaf");
assert.equal(youtube.clips[0].official, true);

await assert.rejects(() => inferActionsFromTranscript({ transcript: "" }, { apiKey: "test" }), /required/);
await assert.rejects(() => transcribeWithGroq(Buffer.from("x"), {}), /GROQ_API_KEY/);

const goblin = await researchGoblinPacket(buildGoblinCollationPacket({
  id: "test-gap",
  fixtureId: "vin-test",
  goalkeeper: "Test Keeper",
  opponent: "Grenada",
  type: "trajectory",
  query: "SVG Grenada highlights",
  evidenceUrl: "https://example.com/report"
}), {
  env: {},
  goblinSources: [{
    id: "licensed-feed",
    sourceType: "licensed event feed",
    collect: async () => ({ items: [{
      evidenceUrl: "https://example.com/feed",
      suggestion: { minute: 55, situation: "open-play", shotOrigin: "Penalty spot", goalZone: "Low right" }
    }] })
  }]
});
assert.equal(goblin.agent, "goblin-compound-research");
assert.equal(goblin.status, "review_required");
assert.equal(goblin.sourceRuns.find((source) => source.id === "concacaf-youtube").status, "failed");
assert.equal(goblin.provisional, true);

console.log("AVI evidence server tests passed");
