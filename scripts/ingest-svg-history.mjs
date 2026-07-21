import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const TEAM = "Saint Vincent and the Grenadines";
const TEAM_ALIASES = [TEAM, "St Vincent and the Grenadines", "Saint Vincent & Grenadines", "St. Vincent & Grenadines"];
const WIKI_TEAM_PAGE = "Saint_Vincent_and_the_Grenadines_national_football_team";
const WIKI_RESULTS_PAGE = "Saint_Vincent_and_the_Grenadines_national_football_team_results";
const USER_AGENT = "AVI-Football-Intelligence/1.0 (historical research importer)";
const KNOWN_SVG_GOALKEEPERS = new Set(["Lemus Christopher", "Dondre Abraham", "Kenyan Lynch", "Garwin Davis", "Samir Bristol", "Josh Stowe"]);

const codeCountries = {
  VIN: TEAM, SVG: TEAM, BVI: "British Virgin Islands", VGB: "British Virgin Islands", AIA: "Anguilla",
  PUR: "Puerto Rico", CUB: "Cuba", DOM: "Dominican Republic", LCA: "Saint Lucia", BOE: "Bonaire",
  BRB: "Barbados", GRN: "Grenada", SUR: "Suriname", SLV: "El Salvador", MSR: "Montserrat",
  BON: "Bonaire", JAM: "Jamaica", TRI: "Trinidad and Tobago", HAI: "Haiti", CUW: "Curaçao"
};

const countryCoordinates = {
  [TEAM]: [13.1567, -61.1499], Dominica: [15.547, -61.3], Grenada: [12.0042, -61.7862],
  Suriname: [5.4528, -55.1878], "El Salvador": [13.4409, -89.0557], Bonaire: [12.2019, -68.2624],
  Montserrat: [16.7918, -62.1933], Barbados: [13.0746, -59.4925], "Dominican Republic": [18.4297, -69.6689],
  "Puerto Rico": [18.2557, -67.1485], "British Virgin Islands": [18.4448, -64.5429], Cuba: [22.9892, -82.4091],
  Belize: [17.5391, -88.3082], Bermuda: [32.364, -64.6787], "French Guiana": [4.8198, -52.3604],
  Nicaragua: [12.1415, -86.1682], Bahamas: [25.039, -77.4662], "Trinidad and Tobago": [10.5954, -61.3372]
};

const stadiumCoordinates = [
  ["arnos vale", 13.1419, -61.2116, TEAM], ["victoria park", 13.155, -61.2248, TEAM],
  ["antonio trenidat", 12.238, -68.326, "Bonaire"], ["cibao", 19.451, -70.697, "Dominican Republic"],
  ["mayagüez", 18.2025, -67.1397, "Puerto Rico"], ["mayaguez", 18.2025, -67.1397, "Puerto Rico"],
  ["cuscatlán", 13.6812, -89.2226, "El Salvador"], ["cuscatlan", 13.6812, -89.2226, "El Salvador"],
  ["kirani james", 12.0598, -61.7539, "Grenada"], ["ffb stadium", 17.4485, -88.3042, "Belize"],
  ["dr. ir. franklin", 5.837, -55.191, "Suriname"], ["bermuda national", 32.2949, -64.7814, "Bermuda"]
];

export function extractFootballBoxes(wikitext) {
  const boxes = [];
  const startPattern = /\{\{\s*football\s*box\s+collapsible|\{\{\s*footballbox\s+collapsible/gi;
  for (const match of wikitext.matchAll(startPattern)) {
    let depth = 0;
    let end = match.index;
    for (let cursor = match.index; cursor < wikitext.length - 1; cursor += 1) {
      const pair = wikitext.slice(cursor, cursor + 2);
      if (pair === "{{") { depth += 1; cursor += 1; }
      else if (pair === "}}") {
        depth -= 1;
        cursor += 1;
        if (depth === 0) { end = cursor + 1; break; }
      }
    }
    const before = wikitext.slice(0, match.index);
    const year = Number([...before.matchAll(/^===\s*(\d{4})\s*===\s*$/gm)].at(-1)?.[1]);
    boxes.push({ year, raw: wikitext.slice(match.index, end) });
  }
  return boxes;
}

export function parseWikiFootballBox({ year, raw }) {
  const fields = parseTemplateFields(raw);
  const team1Code = extractTeamCode(fields.team1);
  const team2Code = extractTeamCode(fields.team2);
  const team1 = codeCountries[team1Code] ?? cleanWikitext(fields.team1);
  const team2 = codeCountries[team2Code] ?? cleanWikitext(fields.team2);
  if (!isSvg(team1) && !isSvg(team2)) return null;
  const [homeGoals, awayGoals] = parseScore(fields.score);
  if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return null;
  const svgFirst = isSvg(team1);
  const date = parsePartialDate(fields.date, year);
  const location = cleanWikitext(fields.location);
  const stadium = cleanWikitext(fields.stadium);
  const venue = resolveVenue(svgFirst ? team1 : team2, svgFirst ? team2 : team1, location, stadium);
  return {
    id: fixtureId(date, svgFirst ? team2 : team1), date, opponent: canonicalCountry(svgFirst ? team2 : team1),
    homeTeam: canonicalCountry(team1), awayTeam: canonicalCountry(team2), venue: venue.type,
    location: location || venue.country, locationCountry: venue.country, stadium,
    competition: cleanWikitext(fields.round), goalsFor: svgFirst ? homeGoals : awayGoals,
    goalsAgainst: svgFirst ? awayGoals : homeGoals, result: cleanWikitext(fields.result) || resultCode(svgFirst ? homeGoals : awayGoals, svgFirst ? awayGoals : homeGoals),
    attendance: parseInteger(fields.attendance), referee: cleanWikitext(fields.referee),
    scorers: parseScorers(svgFirst ? fields.goals1 : fields.goals2), reportUrl: extractUrl(fields.report),
    coordinates: venue.coordinates, coordinateBasis: venue.basis,
    sources: [{ id: "wikipedia-team", trust: .86, url: wikiUrl(WIKI_TEAM_PAGE) }]
  };
}

export function parseWikiResultsTable(wikitext) {
  const section = wikitext.split("==Results==")[1]?.split("==References==")[0] ?? "";
  return section.split(/\n\|-\s*\n/).map((row) => {
    const cells = row.trim().split("||");
    if (cells.length < 5) return null;
    const date = parseDate(cleanWikitext(cells[0].replace(/^\|/, "")));
    const venueCountry = canonicalCountry(cleanWikitext(cells[1]));
    const opponent = canonicalCountry(cleanWikitext(cells[2]));
    const [goalsFor, goalsAgainst] = parseScore(cleanWikitext(cells[3]));
    if (!date || !opponent || !Number.isFinite(goalsFor) || !Number.isFinite(goalsAgainst)) return null;
    const coordinates = coordinatesFor("", venueCountry);
    return {
      id: fixtureId(date, opponent), date, opponent, homeTeam: venueCountry === TEAM ? TEAM : null,
      awayTeam: venueCountry === opponent ? TEAM : null, venue: venueCountry === TEAM ? "Home" : venueCountry === opponent ? "Away" : "Neutral",
      location: venueCountry, locationCountry: venueCountry, stadium: null, competition: cleanWikitext(cells[4]),
      goalsFor, goalsAgainst, result: resultCode(goalsFor, goalsAgainst), attendance: null, referee: null,
      scorers: parseScorers(cells[5] ?? ""), reportUrl: null, coordinates: coordinates?.values ?? null,
      coordinateBasis: coordinates?.basis ?? null,
      sources: [{ id: "wikipedia-results", trust: .8, url: wikiUrl(WIKI_RESULTS_PAGE) }]
    };
  }).filter(Boolean);
}

export function parseNationalFootballTeams(html, year, sourceUrl) {
  const table = html.match(/<table[^>]+id="table-matches"[\s\S]*?<\/table>/i)?.[0] ?? "";
  return [...table.matchAll(/<tr\s+class="[^"]*"[\s\S]*?<\/tr>/gi)].map(([row]) => {
    const date = stripHtml(cellByClass(row, "date"));
    const homeTeam = canonicalCountry(spanName(cellByClass(row, "home")));
    const awayTeam = canonicalCountry(spanName(cellByClass(row, "away")));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (!isSvg(homeTeam) && !isSvg(awayTeam))) return null;
    const [homeGoals, awayGoals] = parseScore(stripHtml(cellByClass(row, "result")));
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return null;
    const stadium = stripHtml(cellByClass(row, "stadium"));
    const reportPath = cellByClass(row, "date").match(/href="([^"]*\/matches\/report\/[^"]+)"/i)?.[1];
    const opponent = isSvg(homeTeam) ? awayTeam : homeTeam;
    const coordinate = coordinatesFor(stadium, isSvg(homeTeam) ? TEAM : homeTeam);
    const completeness = row.match(/<abbr title="([^"]+)"/i)?.[1] ?? "Unspecified";
    return {
      id: fixtureId(date, opponent), date, opponent, homeTeam, awayTeam, venue: isSvg(homeTeam) ? "Home" : "Away",
      location: coordinate?.country ?? (isSvg(homeTeam) ? TEAM : homeTeam), locationCountry: coordinate?.country ?? (isSvg(homeTeam) ? TEAM : homeTeam),
      stadium: stadium || null, competition: stripHtml(cellByClass(row, "event")),
      goalsFor: isSvg(homeTeam) ? homeGoals : awayGoals, goalsAgainst: isSvg(homeTeam) ? awayGoals : homeGoals,
      result: resultCode(isSvg(homeTeam) ? homeGoals : awayGoals, isSvg(homeTeam) ? awayGoals : homeGoals),
      attendance: null, referee: null, scorers: [], reportUrl: null, coordinates: coordinate?.values ?? null,
      matchReportUrl: reportPath ? new URL(reportPath, "https://www.national-football-teams.com").href : null,
      coordinateBasis: coordinate?.basis ?? null, sourceCompleteness: completeness,
      sources: [{ id: "national-football-teams", trust: completeness.toLowerCase().includes("complete") ? .9 : .7, url: sourceUrl, year }]
    };
  }).filter(Boolean);
}

export function parseNftGoalkeeperReport(html, fixture) {
  const formationIndex = html.indexOf('id="formation-157"');
  if (formationIndex < 0) return null;
  const formation = html.slice(formationIndex, html.indexOf("Match Events", formationIndex));
  const goalkeeper = [...formation.matchAll(/<div class="row player[^>]*>([\s\S]*?)<div class="col-3 text-right">/gi)].map((match) => {
    const family = stripHtml(match[1].match(/itemprop="familyName"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "");
    const given = stripHtml(match[1].match(/itemprop="givenName"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "");
    return [given, family].filter(Boolean).join(" ");
  }).find((name) => KNOWN_SVG_GOALKEEPERS.has(name));
  if (!goalkeeper) return null;
  const opponentSide = fixture.homeTeam === TEAM ? "right" : "left";
  const events = [...html.matchAll(/<article class="timeline-box\s+(left|right)\s+event-goal">([\s\S]*?)<\/article>/gi)]
    .filter((match) => match[1].toLowerCase() === opponentSide)
    .map((match) => {
      const body = match[2];
      const minute = Number(stripHtml(body.match(/class="event-minute"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? ""));
      const description = stripHtml(body.match(/<p>([\s\S]*?)<\/p>/i)?.[1] ?? "");
      const scorer = stripHtml(body.match(/<p>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "");
      return {
        minute: Number.isFinite(minute) ? minute : null, scorer: scorer || null,
        situation: /penalty/i.test(description) ? "penalty" : "open-play", description,
        shotOrigin: null, goalZone: null, trajectoryObserved: false,
        source: "national-football-teams-match-report", evidenceUrl: fixture.matchReportUrl
      };
    });
  const eventCountMatches = events.length === fixture.goalsAgainst;
  return {
    goalkeeper, attribution: "starting-lineup", events: eventCountMatches ? events : [], rawEventCount: events.length,
    eventCoverage: eventCountMatches ? 1 : 0, eventStatus: eventCountMatches ? "matched" : "event-count-mismatch",
    source: "national-football-teams-match-report", evidenceUrl: fixture.matchReportUrl
  };
}

export async function enrichGoalkeeperReports(fixtures, fetchText, limit = 24) {
  const targets = fixtures.filter((fixture) => fixture.matchReportUrl).slice(-limit);
  for (const fixture of targets) {
    const html = await fetchText(fixture.matchReportUrl);
    if (html) fixture.goalkeeperAnalysis = parseNftGoalkeeperReport(html, fixture);
  }
  return fixtures;
}

export function mergeFixtures(fixtures) {
  const merged = new Map();
  for (const fixture of fixtures.filter(Boolean).sort((a, b) => a.date.localeCompare(b.date))) {
    const key = `${fixture.date}|${canonicalCountry(fixture.opponent)}`;
    const current = merged.get(key);
    if (!current) { merged.set(key, structuredClone(fixture)); continue; }
    const scoreMatches = current.goalsFor === fixture.goalsFor && current.goalsAgainst === fixture.goalsAgainst;
    const richer = richness(fixture) > richness(current) ? fixture : current;
    const other = richer === fixture ? current : fixture;
    const combined = { ...other, ...richer };
    combined.matchReportUrl = richer.matchReportUrl ?? other.matchReportUrl ?? null;
    combined.sources = uniqueBy([...(current.sources ?? []), ...(fixture.sources ?? [])], (source) => source.id);
    combined.consensus = scoreMatches ? "validated" : "disputed";
    if (!scoreMatches) combined.discrepancy = { scores: uniqueBy([[current.goalsFor, current.goalsAgainst], [fixture.goalsFor, fixture.goalsAgainst]], JSON.stringify) };
    merged.set(key, combined);
  }
  return [...merged.values()].map((fixture) => ({ ...fixture, consensus: fixture.consensus ?? "provisional" }));
}

export function deriveFixtureContext(fixtures) {
  const ordered = [...fixtures].sort((a, b) => a.date.localeCompare(b.date));
  return ordered.map((fixture, index) => {
    const previous = ordered[index - 1];
    const prior = ordered.slice(Math.max(0, index - 5), index);
    const restDays = previous ? Math.round((Date.parse(fixture.date) - Date.parse(previous.date)) / 86400000) : null;
    const rollingPoints = prior.reduce((sum, match) => sum + (match.result === "W" ? 3 : match.result === "D" ? 1 : 0), 0);
    const rollingGoalDifference = prior.reduce((sum, match) => sum + match.goalsFor - match.goalsAgainst, 0);
    const travelKmFromSvg = fixture.coordinates ? Math.round(haversine(countryCoordinates[TEAM], fixture.coordinates)) : null;
    const filled = [fixture.stadium, fixture.location, fixture.competition, fixture.attendance, fixture.referee, fixture.scorers?.length, fixture.coordinates].filter(Boolean).length;
    return { ...fixture, restDays, rolling5: { matches: prior.length, points: rollingPoints, goalDifference: rollingGoalDifference }, travelKmFromSvg, dataCompleteness: Math.round(filled / 7 * 100) };
  });
}

export async function enrichWeather(fixtures, fetcher = fetch) {
  for (const fixture of fixtures) {
    if (!fixture.coordinates) continue;
    const [latitude, longitude] = fixture.coordinates;
    const params = new URLSearchParams({ latitude, longitude, start_date: fixture.date, end_date: fixture.date, timezone: "auto", daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code" });
    try {
      const response = await fetcher(`https://archive-api.open-meteo.com/v1/archive?${params}`, { headers: { "User-Agent": USER_AGENT } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const daily = (await response.json()).daily;
      fixture.weather = daily?.time?.length ? {
        temperatureMaxC: daily.temperature_2m_max?.[0] ?? null, temperatureMinC: daily.temperature_2m_min?.[0] ?? null,
        precipitationMm: daily.precipitation_sum?.[0] ?? null, windMaxKmh: daily.wind_speed_10m_max?.[0] ?? null,
        weatherCode: daily.weather_code?.[0] ?? null, source: "open-meteo-archive",
        evidenceUrl: `https://open-meteo.com/en/docs/historical-weather-api`, locationBasis: fixture.coordinateBasis
      } : null;
    } catch (error) {
      fixture.weather = { unavailable: true, reason: error.message, source: "open-meteo-archive" };
    }
  }
  return fixtures;
}

export function toContextRecords(fixtures) {
  return fixtures.flatMap((fixture) => {
    const scope = { domain: "international", competition: fixture.competition || "All competitions", team: fixture.opponent, player: null };
    const common = { source: "svg-history", eventId: fixture.id, scope, observedAt: `${fixture.date}T12:00:00Z`, evidenceUrl: fixture.sources[0]?.url, provenance: fixture.sources.map((source) => source.id), consensus: fixture.consensus };
    const metrics = [
      ["goalsFor", fixture.goalsAgainst, "result", "goals"], ["goalsAgainst", fixture.goalsFor, "result", "goals"],
      ["svgGoalsFor", fixture.goalsFor, "result", "goals"], ["svgGoalsAgainst", fixture.goalsAgainst, "result", "goals"],
      ["resultPoints", fixture.result === "W" ? 3 : fixture.result === "D" ? 1 : 0, "result", "points"],
      ["restDays", fixture.restDays, "schedule", "days"], ["travelKm", fixture.travelKmFromSvg, "travel", "km"],
      ["attendance", fixture.attendance, "match-context", "people"], ["temperatureMaxC", fixture.weather?.temperatureMaxC, "conditions", "C"],
      ["precipitationMm", fixture.weather?.precipitationMm, "conditions", "mm"], ["windMaxKmh", fixture.weather?.windMaxKmh, "conditions", "km/h"]
    ];
    return metrics.filter(([, value]) => Number.isFinite(Number(value))).map(([metric, value, metricFamily, unit]) => ({ ...common, metric, value, metricFamily, unit }));
  });
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--reindex")) {
    const historyUrl = new URL("../data/svg-fixture-history.json", import.meta.url);
    const output = JSON.parse(await readFile(historyUrl, "utf8"));
    for (const fixture of output.fixtures) {
      const analysis = fixture.goalkeeperAnalysis;
      if (!analysis) continue;
      analysis.rawEventCount = analysis.events.length;
      const matched = analysis.events.length === fixture.goalsAgainst;
      analysis.eventCoverage = matched ? 1 : 0;
      analysis.eventStatus = matched ? "matched" : "event-count-mismatch";
      if (!matched) analysis.events = [];
    }
    output.contextRecords = toContextRecords(output.fixtures);
    output.meta.contextRecordCount = output.contextRecords.length;
    await persistOutput(output, historyUrl);
    console.log(`Reindexed ${output.fixtures.length} SVG fixtures into ${output.contextRecords.length} contextual records.`);
    return;
  }
  const since = process.argv.find((arg) => arg.startsWith("--since="))?.split("=")[1] ?? "2022-01-01";
  const skipWeather = args.has("--skip-weather");
  const failures = [];
  const fetchText = async (url, required = false) => {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      failures.push({ url, error: error.message });
      if (required) throw error;
      return null;
    }
  };
  const wikiApi = (page) => `https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=wikitext&format=json&formatversion=2`;
  const [teamPayload, resultsPayload] = await Promise.all([fetchText(wikiApi(WIKI_TEAM_PAGE), true), fetchText(wikiApi(WIKI_RESULTS_PAGE), true)]);
  const teamWikitext = JSON.parse(teamPayload).parse.wikitext;
  const resultsWikitext = JSON.parse(resultsPayload).parse.wikitext;
  const fixtures = [
    ...extractFootballBoxes(teamWikitext).map(parseWikiFootballBox),
    ...parseWikiResultsTable(resultsWikitext)
  ];
  const currentYear = new Date().getUTCFullYear();
  for (let year = Number(since.slice(0, 4)); year <= currentYear; year += 1) {
    const url = `https://www.national-football-teams.com/country/157/${year}/Saint_Vincent_Grenadines.html`;
    const html = await fetchText(url);
    if (html) fixtures.push(...parseNationalFootballTeams(html, year, url));
  }
  let history = deriveFixtureContext(mergeFixtures(fixtures).filter((fixture) => fixture.date >= since && fixture.date <= new Date().toISOString().slice(0, 10)));
  if (!args.has("--skip-reports")) history = await enrichGoalkeeperReports(history, fetchText, 24);
  if (!skipWeather) history = await enrichWeather(history);
  const contextRecords = toContextRecords(history);
  const output = {
    meta: {
      name: "SVG senior historical fixture context", generatedAt: new Date().toISOString(), since,
      team: TEAM, fixtureCount: history.length, contextRecordCount: contextRecords.length,
      sources: [wikiUrl(WIKI_TEAM_PAGE), wikiUrl(WIKI_RESULTS_PAGE), "https://www.national-football-teams.com/", "https://open-meteo.com/en/docs/historical-weather-api"], failures
    },
    fixtures: history,
    contextRecords
  };
  await persistOutput(output, new URL("../data/svg-fixture-history.json", import.meta.url));
  console.log(`Imported ${history.length} SVG fixtures and ${contextRecords.length} contextual records (${failures.length} source failures).`);
}

async function persistOutput(output, historyUrl) {
  await writeFile(historyUrl, `${JSON.stringify(output, null, 2)}\n`);
  const databaseUrl = new URL("../data/padagonia-db.json", import.meta.url);
  const database = JSON.parse(await readFile(databaseUrl, "utf8"));
  database.meta.history = { file: "data/svg-fixture-history.json", generatedAt: output.meta.generatedAt, fixtureCount: output.fixtures.length, contextRecordCount: output.contextRecords.length };
  database.historicalFixtures = output.fixtures;
  database.historicalContext = output.contextRecords;
  await writeFile(databaseUrl, `${JSON.stringify(database, null, 2)}\n`);
}

function parseTemplateFields(raw) {
  const fields = {};
  let key = null;
  for (const line of raw.split("\n").slice(1)) {
    const match = line.match(/^\|\s*([^=]+?)\s*=\s*(.*)$/);
    if (match) { key = match[1].trim().toLowerCase(); fields[key] = match[2].trim(); }
    else if (key && !line.trim().startsWith("}}")) fields[key] += `\n${line.trim()}`;
  }
  return fields;
}

function parseScorers(value = "") {
  return value.split(/<br\s*\/?\s*>|\n\*/i).map((line) => {
    const name = cleanWikitext(line.replace(/\{\{goal[\s\S]*/i, "")).replace(/^\*/, "").trim();
    const minutes = [...line.matchAll(/\{\{goal\|([^}|]+)/gi)].map((match) => match[1]);
    return name ? { name, minutes } : null;
  }).filter(Boolean);
}

function extractTeamCode(value = "") { return value.match(/\{\{\s*fb(?:-rt)?\|([^|}]+)/i)?.[1]?.trim().toUpperCase(); }
function extractUrl(value = "") { return value.match(/https?:\/\/[^\s}\]|]+/)?.[0] ?? null; }
function parseScore(value = "") { return value.replace(/<[^>]*>/g, "").match(/(\d+)\s*[-–—:]\s*(\d+)/)?.slice(1, 3).map(Number) ?? [NaN, NaN]; }
function parseInteger(value = "") { const parsed = Number(cleanWikitext(value).replace(/[^\d]/g, "")); return parsed || null; }
function parseDate(value) {
  const clean = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const date = new Date(`${clean} 12:00:00 UTC`);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
}
function parsePartialDate(value, year) { return parseDate(`${cleanWikitext(value)} ${year}`); }
function resultCode(goalsFor, goalsAgainst) { return goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D"; }
function fixtureId(date, opponent) { return `vin-${date}-${slug(opponent)}`; }
function slug(value = "") { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function canonicalCountry(value = "") {
  const clean = decodeHtml(value).replace(/\s+/g, " ").trim();
  if (isSvg(clean)) return TEAM;
  return ({
    "Trinidad & Tobago": "Trinidad and Tobago", "Antigua & Barbuda": "Antigua and Barbuda",
    "Saint Kitts & Nevis": "Saint Kitts and Nevis", "St Kitts & Nevis": "Saint Kitts and Nevis",
    "St. Kitts & Nevis": "Saint Kitts and Nevis", "St. Lucia": "Saint Lucia"
  })[clean] ?? clean;
}
function isSvg(value = "") { return TEAM_ALIASES.some((alias) => value.toLowerCase() === alias.toLowerCase()); }
function wikiUrl(page) { return `https://en.wikipedia.org/wiki/${page}`; }
function uniqueBy(items, key) { const seen = new Set(); return items.filter((item) => { const value = key(item); if (seen.has(value)) return false; seen.add(value); return true; }); }
function richness(fixture) { return [fixture.stadium, fixture.location, fixture.attendance, fixture.referee, fixture.scorers?.length, fixture.reportUrl, fixture.coordinates].filter(Boolean).length; }
function cellByClass(row, name) { return row.match(new RegExp(`<td[^>]*class="[^"]*\\b${name}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`, "i"))?.[1] ?? ""; }
function spanName(value) { return stripHtml(value.match(/<span[^>]*itemprop="name"[^>]*>[\s\S]*?<\/span>/i)?.[0] ?? value); }
function stripHtml(value = "") { return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()); }
function decodeHtml(value = "") { return value.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&ndash;/g, "–"); }
function cleanWikitext(value = "") {
  let clean = value.replace(/<ref[\s\S]*?<\/ref>|<ref[^>]*\/>/gi, " ");
  clean = clean.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1");
  for (let pass = 0; pass < 4; pass += 1) clean = clean.replace(/\{\{[^{}]*\}\}/g, " ");
  return decodeHtml(clean.replace(/'{2,}/g, "").replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function resolveVenue(svgTeam, opponent, location, stadium) {
  const coordinate = coordinatesFor(stadium, location || (isSvg(svgTeam) ? TEAM : opponent));
  const country = coordinate?.country ?? canonicalCountry(location.split(",").at(-1) || TEAM);
  const type = country === TEAM ? "Home" : country === canonicalCountry(opponent) ? "Away" : "Neutral";
  return { type, country, coordinates: coordinate?.values ?? null, basis: coordinate?.basis ?? null };
}

function coordinatesFor(stadium = "", country = "") {
  const match = stadiumCoordinates.find(([needle]) => stadium.toLowerCase().includes(needle));
  if (match) return { values: [match[1], match[2]], country: match[3], basis: "stadium-coordinate" };
  const canonical = canonicalCountry(country);
  return countryCoordinates[canonical] ? { values: countryCoordinates[canonical], country: canonical, basis: "country-airport-fallback" } : null;
}

function haversine(a, b) {
  const rad = (degrees) => degrees * Math.PI / 180;
  const dLat = rad(b[0] - a[0]); const dLon = rad(b[1] - a[1]);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
