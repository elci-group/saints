import assert from "node:assert/strict";
import { trajectoryCoordinates } from "./keeper-scene.js";
import {
  buildGoblinCollationPacket,
  buildKeeperEvidenceGaps,
  normalizeVideoSuggestion,
  searchYouTubeChannelClips,
  searchYouTubeClips,
  validVideoUrl
} from "./keeper-ingress.js";

const penalty = trajectoryCoordinates({ shotOrigin: "Penalty spot", goalZone: "Low right" });
assert.deepEqual(penalty.origin, [0, 0.18, 11]);
assert.ok(penalty.target[0] > 0);
assert.equal(penalty.target[1], 0.32);
assert.equal(trajectoryCoordinates({ shotOrigin: null, goalZone: "Low right" }), null);

const fixtures = [{
  id: "vin-test",
  date: "2025-06-01",
  opponent: "Grenada",
  competition: "Friendly",
  goalsAgainst: 2,
  goalkeeperAnalysis: {
    goalkeeper: "Test Keeper",
    eventCoverage: 0.5,
    evidenceUrl: "https://example.com/report",
    events: [{ minute: 42, shotOrigin: null, goalZone: null, trajectoryObserved: false }]
  }
}];
const gaps = buildKeeperEvidenceGaps(fixtures, "Test Keeper");
assert.equal(gaps.length, 2);
assert.equal(gaps[0].type, "event");
assert.match(gaps[0].query, /Grenada 2025 highlights/);
const collationPacket = buildGoblinCollationPacket(gaps[0]);
assert.equal(collationPacket.constraints.neverInferAsObserved, true);
assert.equal(collationPacket.schemaVersion, 2);
assert.deepEqual(collationPacket.orchestration.stages, ["scope", "discover", "corroborate", "synthesise", "review"]);

assert.equal(validVideoUrl("https://www.youtube.com/watch?v=abc123"), true);
assert.equal(validVideoUrl("https://youtu.be/abc123"), true);
assert.equal(validVideoUrl("https://example.com/video"), false);
assert.deepEqual(normalizeVideoSuggestion({
  minute: "55",
  situation: "counterattack",
  shotOrigin: "Left side of penalty area",
  goalZone: "Low right",
  confidence: 1.5
}), {
  minute: 55,
  situation: "counterattack",
  shotOrigin: "Left side of penalty area",
  goalZone: "Low right",
  confidence: 1
});

let requestedUrl = "";
const clips = await searchYouTubeClips({
  query: "SVG Grenada highlights",
  apiKey: "test-key",
  fetchImpl: async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => ({ items: [{ id: { videoId: "abc123" }, snippet: { title: "Highlights", channelTitle: "FA TV" } }] })
    };
  }
});
assert.match(requestedUrl, /^https:\/\/www\.googleapis\.com\/youtube\/v3\/search\?/);
assert.match(requestedUrl, /type=video/);
assert.equal(clips[0].url, "https://www.youtube.com/watch?v=abc123");

const channelRequests = [];
const officialClips = await searchYouTubeChannelClips({
  query: "SVG highlights",
  handle: "@concacaf",
  apiKey: "test-key",
  fetchImpl: async (url) => {
    channelRequests.push(url);
    if (url.includes("/channels?")) return { ok: true, json: async () => ({ items: [{ id: "UC-CONCACAF" }] }) };
    return { ok: true, json: async () => ({ items: [{ id: { videoId: "official-1" }, snippet: { title: "Official highlights", channelTitle: "Concacaf" } }] }) };
  }
});
assert.match(channelRequests[0], /forHandle=concacaf/);
assert.match(channelRequests[1], /channelId=UC-CONCACAF/);
assert.equal(officialClips[0].official, true);

console.log("Keeper Lab scene and ingress tests passed");
