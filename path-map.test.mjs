import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PathTracker } from "./path-engine.js";
import { buildPathMapModel, createPathMapSvg } from "./path-map.js";

const config = JSON.parse(await readFile(new URL("./data/path-config.json", import.meta.url), "utf8"));
const tracker = new PathTracker(config);
const players = [
  { name: "London Player", club: "Academy (ENG)" },
  { name: "Miami Player", club: "College (USA)" },
  { name: "Local Player", club: "Local club (VIN)" }
];
const categories = tracker.resolveCategoryDestinations("2026-08-01");
const model = buildPathMapModel(tracker, players, categories);
assert.equal(model.playerCount, 3);
assert.equal(model.origins.length, 3);
assert.equal(model.routes.length, model.origins.length * categories.length);
assert.match(model.viewBox, /^\d+\.\d \d+\.\d \d+\.\d \d+\.\d$/);
const svg = createPathMapSvg(model);
assert.match(svg, /path-map-land/);
assert.match(svg, /path-map-route/);
assert.match(svg, /Senior · SVD/);
assert.match(svg, /U20 \/ U21 pathway · SVD/);

console.log("PATH world map tests passed");
