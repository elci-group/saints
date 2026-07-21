# AVI Football Intelligence

Static football intelligence workspace for Caribbean player scouting, AVI/XAVI analysis, goalkeeper training, historical match context and possession directness modelling.

The primary player-pool view is backed by the official 2026 Concacaf U20 Qualifiers roster import in `data/concacaf-u20-pools.json`. It covers Saint Vincent and the Grenadines plus 11 Tier 1 and Tier 2 Caribbean opponents, with nationality, position, age and club filtering.

The Padagonia database combines a synthetic action-value seed with a provenance-tracked SVG senior fixture archive containing:

- action definitions and learned win-contribution weights
- fixture-level Winning Action Budgets
- player actions, annual cost and possession usage
- player-to-player interaction values for XAVI
- candidate lineups for Most Valuable Lineup comparison
- real SVG scores, competitions, venues, report provenance and consensus status from 2022 onward
- derived rest, travel, rolling-form and historical weather context
- attributed goalkeeper starts and reconciled conceded-goal events where match reports support them

## Historical ingestion

Refresh the checked-in archive and Padagonia historical arrays with:

```bash
node scripts/ingest-svg-history.mjs --since=2022-01-01
```

The importer parses the Wikipedia team and results pages, cross-checks recent year pages from National Football Teams, follows dated match reports for goalkeeper attribution, and enriches known venue dates through the Open-Meteo archive. Claims retain their evidence URL and are marked `validated`, `provisional`, or `disputed`. `--skip-weather` and `--skip-reports` disable the slower enrichers; `--reindex` rebuilds Padagonia context records without network access.

## Run

Run the AVI server so the browser can load the JSON database and evidence APIs:

```bash
export GROQ_API_KEY="..."
export YOUTUBE_DATA_API_KEY="..."
npm run dev
```

Then open:

```text
http://127.0.0.1:8081/
```

`GROQ_API_KEY` and `YOUTUBE_DATA_API_KEY` remain server-side. Without them, the main application and manual tracking workspace continue to work, while the corresponding server controls report that their adapter is unavailable.

## Model

AVI ranks individual contribution efficiency against the selected fixture constraint.
XAVI adds network interaction value to the lineup's capped action coverage.
AER divides weighted winning actions by possessions used.

The AVI visualiser exposes 50 common formation variants, including 4-3-3, 4-2-3-1 and 4-4-2, through one generic role-assignment and pitch-layout engine. It evaluates every position-eligible XI against the active fixture and synergy weight, then automatically populates the formation with the highest-XAVI squad.

## Win-Req

The Win-Req workspace compares an opponent's ten-win and ten-loss performance bands to produce attacking targets, defensive ceilings, chance-location and assist-method priorities, transition requirements, and physical-load thresholds. PDI estimates player caloric demand from distance, sprints, jostling load, player/opponent weight, opposition strength, pitch area and conditions. Tracking-dependent values are labelled as inferred.

### Context broker

`context-engine.js` stores source claims in a Padagonia context array scoped by domain, competition, team and optional player. It loads data just in time, caches by scope and venue, applies per-source and per-metric trust weights, calculates weighted-median consensus, and records discrepancies when claims exceed the configured tolerance.

Wikipedia uses its API adapter. BBC Sport and LiveScore are licensed/manual adapters because their public pages are not treated as scraping APIs; Plain Text Sports uses the same lightweight manual path because football coverage varies. Authorised records can be added from the browser console or an integration with:

```js
aviIngestSourceRecords("bbc-sport", [{
  eventId: "canonical-match-id",
  scope: {
    domain: "international",
    competition: "Concacaf Nations League",
    team: "Grenada",
    player: null,
    venue: "Home"
  },
  metric: "goalsFor",
  metricFamily: "result",
  value: 2,
  observedAt: "2026-06-01T20:00:00Z",
  evidenceUrl: "https://example.com/evidence"
}]);
```

## PATH

The PATH workspace ranks Player Aggregated Travel Hours across the selected squad. It combines completed travel with remaining club and international journeys, recalculates when qualification status or transfer geography changes, and resolves the fastest available inbound route to Saint Vincent or the next away-fixture country.

Training-ground coordinates and complete schedules are not present in the roster feed, so the initial view is explicitly labelled as modelled and falls back to the club country’s principal airport. Authorised schedule records replace fixture-count estimates, while authorised flight options replace the local route graph for matching dates and airport pairs:

```js
aviIngestPathSchedules([{
  player: "Player Name",
  domain: "international",
  status: "scheduled",
  originAirport: "LHR",
  destinationAirport: "SVD",
  departureDate: "2026-09-03"
}]);

aviIngestFlightOptions([{
  origin: "LHR",
  destination: "SVD",
  departureDate: "2026-09-03",
  durationHours: 10.4,
  distanceKm: 6880,
  airports: ["LHR", "BGI", "SVD"],
  source: "amadeus"
}]);
```

Amadeus is treated as a credentialled commercial-itinerary adapter. OpenSky is retained for observed-flight validation only, because it does not provide commercial schedules. The local connected-airport graph remains available as a clearly marked estimate when neither source has a matching record.

## Keeper Lab

Keeper Lab links reconciled match-report goal events to verified SVG goalkeepers. It separates open play and penalties, maps only observed shot origins and goal zones onto an interactive Three.js final-third pitch, and translates repeated patterns into attacking and defensive training priorities. The scene supports drag orbit, wheel zoom, camera reset and animated ball trajectories. Match events without trajectory descriptions remain visibly uncoded.

The Padagonia gap queue identifies scoreline goals that have not been reconciled to report events and attributed events that still lack trajectory coding. Its Goblin ingress hook receives constrained collation packets and must return provisional evidence for analyst review. Without an adapter, packets are retained in local storage:

```js
aviRegisterGoblinAdapter(async (packet) => {
  return yourCollationService.collect(packet);
});
```

Goblin now defaults to the server-side compound research agent at `POST /api/goblin/research`. Each run scopes the gap, fans out across authorised source adapters, deduplicates evidence and clips, scores corroborated structured candidates, and returns a visible trace for analyst review. Existing provenance and the official Concacaf YouTube adapter are built in; licensed reports or event feeds can be injected through `createAviServer({ goblinSources })`. Research output is always provisional and never becomes observed evidence until the analyst confirms it in the manual intelligence wizard.

Kaptaind monitors this project with cluster-only staging, required `npm test` qualification, local semantic versioning and push disabled. Runtime state is written under `.kaptaind/` and excluded from Git.

The clip matcher uses the official YouTube Data API. Concacaf searches use the server-side key; broader searches can use a key held only in the current browser form. Selecting a result links the clip to the manual intelligence wizard. A video-in model can suggest minute, situation, shot origin and goal zone through a registered adapter, but its output is not marked observed until the analyst confirms the action:

```js
aviRegisterVideoModelAdapter(async ({ videoUrl, timestampSeconds, gap, outputSchema }) => {
  return yourVideoModel.analyse({ videoUrl, timestampSeconds, gap, outputSchema });
});
```

### Broadcast evidence studio

The official [Concacaf YouTube channel](https://www.youtube.com/concacaf) is the default video evidence source. The AVI server resolves `@concacaf` through the YouTube Data API and then restricts searches to that channel ID; the broader browser-key search remains available as a separate source. Concacaf also publishes its video catalogue on its [official video page](https://www.concacaf.com/videos/).

YouTube embeds expose playback but not video pixels. Calibration and tracking therefore use an analyst-authorised local MP4/WebM file or a registered tracking adapter. The studio provides:

- a review timeline with manual, tracking and inferred markers
- labelled pitch landmarks and a solved image-to-pitch homography
- four-point goal-frame calibration
- timestamped ball, SVG player and opponent keyframes with interpolation
- provisional goal-entry and goal-zone candidates
- commentary and geometry reconciliation within a 1.5-second window, with disagreements flagged
- one-click loading into the existing amendment and confirmation wizard

Server-side STT posts the authorised media file to Groq's OpenAI-compatible audio transcription endpoint using `whisper-large-v3-turbo`, verbose JSON and segment timestamps. Groq documents MP4, WebM, WAV and other audio formats, with a 25 MB free-tier attachment limit; AVI applies the same 25 MB request guard. See [Groq Speech to Text](https://console.groq.com/docs/speech-to-text).

Commentary inference uses Groq Structured Outputs with `openai/gpt-oss-20b` and a strict JSON schema. Missing action properties must remain `null` or `unknown`, and every returned record is provisional. See [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs).

Authorised tracking output can be connected without changing the UI:

```js
aviRegisterBroadcastTracker(async ({ file, duration, calibration }) => ({
  frames: await yourTracker.track({ file, duration, calibration })
}));
```

Each frame has `{ trackId, type, team, time, x, y }`, where `x` and `y` are normalised image coordinates. `type` is `ball` or `player`; player `team` is `svg` or `opponent`.

Additional video-coded or licensed events can be supplied without changing the importer:

```js
aviIngestGoalkeeperEvents([{
  goalkeeper: "Lemus Christopher",
  date: "2024-06-05",
  opponent: "Suriname",
  minute: 46,
  outcome: "conceded",
  situation: "open-play",
  shotOrigin: "Right side of six-yard box",
  goalZone: "Low centre",
  trajectoryObserved: true,
  evidenceQuality: "Video coded",
  evidenceUrl: "https://example.com/authorised-match-video"
}]);
```
