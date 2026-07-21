import assert from "node:assert/strict";
import { createCompoundResearchPlan, createExistingEvidenceSource, runCompoundResearch } from "./goblin-agent.js";
import { buildGoblinCollationPacket } from "./keeper-ingress.js";

const gap = {
  id: "vin-test-event-1",
  fixtureId: "vin-test",
  goalkeeper: "Test Keeper",
  date: "2025-06-01",
  opponent: "Grenada",
  type: "trajectory",
  query: "SVG Grenada 2025 highlights goals",
  evidenceUrl: "https://example.com/report"
};
const packet = buildGoblinCollationPacket(gap);
assert.deepEqual(createCompoundResearchPlan(packet).stages.map((stage) => stage.id), ["scope", "discover", "corroborate", "synthesise", "review"]);

const suggestion = { minute: 42, situation: "open-play", shotOrigin: "Penalty spot", goalZone: "Low right" };
const result = await runCompoundResearch(packet, {
  now: () => "2026-07-21T16:00:00.000Z",
  sources: [
    createExistingEvidenceSource(),
    {
      id: "official-report",
      label: "Official report",
      sourceType: "official match report",
      collect: async () => ({ items: [{ evidenceUrl: "https://example.com/official", suggestion }] })
    },
    {
      id: "licensed-feed",
      label: "Licensed feed",
      sourceType: "licensed event feed",
      collect: async () => ({
        items: [{ evidenceUrl: "https://example.com/feed", suggestion }],
        clips: [{ videoId: "clip-1", url: "https://www.youtube.com/watch?v=clip-1" }, { videoId: "clip-1", url: "https://www.youtube.com/watch?v=clip-1" }]
      })
    },
    { id: "unavailable", collect: async () => { throw new Error("adapter offline"); } }
  ]
});

assert.equal(result.status, "review_required");
assert.equal(result.provisional, true);
assert.equal(result.observed, false);
assert.equal(result.sourceRuns.filter((source) => source.status === "failed").length, 1);
assert.equal(result.clips.length, 1);
assert.equal(result.candidates[0].corroboration, 2);
assert.ok(result.confidence > 0.8);
assert.deepEqual(result.unresolvedFields, []);
assert.equal(result.trace.at(-1).status, "pending");
await assert.rejects(() => runCompoundResearch({}, { sources: [] }), /collation packet/);

console.log("Goblin compound research agent tests passed");
