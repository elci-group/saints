import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PathTracker } from "./path-engine.js";

const config = JSON.parse(await readFile(new URL("./data/path-config.json", import.meta.url), "utf8"));
const player = { name: "Test Traveller", club: "Test Club (ENG)", position: "MF" };

const model = new PathTracker(config);
const route = model.route("LHR", "SVD");
assert.equal(route.airports[0], "LHR");
assert.equal(route.airports.at(-1), "SVD");
assert.ok(Number.isFinite(route.durationHours));

const active = model.calculatePlayer(player, "SVD", "active");
const eliminated = model.calculatePlayer(player, "SVD", "eliminated");
assert.ok(active.predictedHours > eliminated.predictedHours);
assert.equal(active.scheduleBasis, "modelled");

model.applyTransfer(player.name, "Miami Test FC", "MIA");
assert.equal(model.calculatePlayer(player, "SVD", "active").origin.airport, "MIA");

const scheduled = new PathTracker(config);
scheduled.ingestFlightOptions([{ origin: "LHR", destination: "SVD", durationHours: 8.5, distanceKm: 6900, airports: ["LHR", "BGI", "SVD"], source: "amadeus" }]);
scheduled.ingestScheduleRecords([
  { player: player.name, domain: "club", status: "completed", originAirport: "LHR", destinationAirport: "MAD" },
  { player: player.name, domain: "club", status: "scheduled", originAirport: "LHR", destinationAirport: "FRA" },
  { player: player.name, domain: "international", status: "scheduled", originAirport: "LHR", destinationAirport: "SVD" }
]);
const ingested = scheduled.calculatePlayer(player, "SVD", "active");
assert.equal(ingested.scheduleBasis, "ingested");
assert.equal(ingested.remainingClubAway, 1);
assert.equal(ingested.remainingInternational, 1);
assert.equal(scheduled.calculatePlayer(player, "SVD", "eliminated").remainingInternational, 0);

console.log("PATH route and schedule tests passed");
