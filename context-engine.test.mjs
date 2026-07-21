import assert from "node:assert/strict";
import { PadagoniaContextArray, buildConsensus } from "./context-engine.js";

const config = {
  sources: [
    { id: "source-a", baseTrust: .9, metricTrust: { result: .95 } },
    { id: "source-b", baseTrust: .7, metricTrust: { result: .72 } }
  ],
  tolerances: { goalsFor: 0 }
};
const scope = { domain: "international", competition: "Test Cup", team: "SVG", player: null };
const claim = (source, value, eventId = "match-1") => ({ source, eventId, scope, metric: "goalsFor", metricFamily: "result", value });

const store = new PadagoniaContextArray([
  claim("source-a", 2),
  claim("source-b", 3),
  { ...claim("source-a", 1, "player-match"), scope: { ...scope, player: "Player One" } }
]);
assert.equal(store.query({ domain: "international", competition: "Test Cup", team: "SVG", player: null }).length, 2);
assert.equal(store.query({ domain: "international", competition: "Test Cup", team: "SVG", player: "Player One" }).length, 1);

const disputed = buildConsensus(store.query({ domain: "international", competition: "Test Cup", team: "SVG", player: null }), config);
assert.equal(disputed.disputed, 1);
assert.equal(disputed.points[0].status, "disputed");

const validated = buildConsensus([claim("source-a", 2), claim("source-b", 2)], config);
assert.equal(validated.validated, 1);
assert.equal(validated.points[0].value, 2);

console.log("context consensus tests passed");
