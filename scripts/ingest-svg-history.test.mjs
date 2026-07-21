import assert from "node:assert/strict";
import {
  extractFootballBoxes, mergeFixtures, parseNftGoalkeeperReport,
  parseWikiFootballBox, parseWikiResultsTable
} from "./ingest-svg-history.mjs";

const boxText = `===2025===
{{footballbox collapsible
|round = [[Friendly]]
|date = 29 May
|team1 = {{fb-rt|VIN}}
|score = 1–1
|team2 = {{fb|BVI}}
|location = [[Arnos Vale]], Saint Vincent and the Grenadines
|stadium = [[Arnos Vale Stadium]]
|result = D
}}`;
const box = parseWikiFootballBox(extractFootballBoxes(boxText)[0]);
assert.equal(box.date, "2025-05-29");
assert.equal(box.opponent, "British Virgin Islands");
assert.equal(box.goalsFor, 1);

const resultText = `==Results==
{| class="wikitable"
|-
|May 12, 2022|| [[Dominica]]|| [[Dominica national football team|Dominica]]||1–2||[[Friendly]]||
|}
==References==`;
const historical = parseWikiResultsTable(resultText)[0];
assert.equal(historical.date, "2022-05-12");

const merged = mergeFixtures([box, { ...box, sources: [{ id: "second-source" }] }]);
assert.equal(merged.length, 1);
assert.equal(merged[0].consensus, "validated");

const report = `<div id="formation-157"></div>
<div class="row player player_1"><div itemprop="athletes"><span itemprop="familyName">Christopher</span>, <span itemprop="givenName">Lemus</span></div><div class="col-3 text-right"></div></div>
Match Events
<article class="timeline-box left event-goal"><div class="event-minute">39</div><p><a>Test Scorer</a> scored a penalty!</p></article>`;
const keeper = parseNftGoalkeeperReport(report, { homeTeam: "Suriname", goalsAgainst: 1, matchReportUrl: "https://example.test/report" });
assert.equal(keeper.goalkeeper, "Lemus Christopher");
assert.equal(keeper.events[0].situation, "penalty");
assert.equal(keeper.eventStatus, "matched");

console.log("SVG history ingestion tests passed");
