import { ContextBroker } from "./context-engine.js";
import { PathTracker } from "./path-engine.js";
import { KeeperFinalThirdScene } from "./keeper-scene.js";
import { BroadcastTracker, pitchLandmarks } from "./tracking-engine.js";
import {
  buildKeeperEvidenceGaps,
  buildGoblinCollationPacket,
  normalizeVideoSuggestion,
  searchYouTubeChannelClips,
  searchYouTubeClips,
  validVideoUrl
} from "./keeper-ingress.js";

const state = {
  db: null,
  u20Pools: null,
  fixtureId: null,
  lineupId: null,
  formationId: "433",
  optimizedLineup: null,
  winReqOpponent: "Grenada",
  contextBroker: null,
  contextResult: null,
  pathTracker: null,
  pathResults: [],
  pathPlayerName: null,
  keeperName: "Lemus Christopher",
  keeperLayer: "all",
  keeperScene: null,
  keeperScenePaused: false,
  keeperGaps: [],
  selectedGapId: null,
  clipMatches: [],
  goblinAdapter: null,
  goblinResearch: null,
  videoModelAdapter: null,
  broadcastTracker: new BroadcastTracker(),
  broadcastTrackingAdapter: null,
  broadcastFile: null,
  broadcastTool: "cursor",
  broadcastCandidates: [],
  transcript: null,
  selectedBroadcastCandidate: null,
  activeView: "scouting",
  mode: "cost",
  synergyWeight: 1
};

const roleEligibility = {
  GK: ["GK"], CB: ["CB", "LB", "RB"], LB: ["LB", "CB"], RB: ["RB", "CB"],
  LWB: ["LB", "LW", "CM"], RWB: ["RB", "RW", "CM"], DM: ["DM", "CM", "CB"],
  CM: ["CM", "DM", "AM"], LM: ["LW", "CM", "LB"], RM: ["RW", "CM", "RB"],
  AM: ["AM", "CM", "LW", "RW"], LW: ["LW", "AM", "ST"], RW: ["RW", "AM", "ST"],
  SS: ["AM", "ST", "CM"], ST: ["ST", "AM", "LW", "RW"]
};

const formationSpecs = [
  ["433", "4-3-3", [["GK"],["LB","CB","CB","RB"],["CM","DM","CM"],["LW","ST","RW"]]],
  ["4231", "4-2-3-1", [["GK"],["LB","CB","CB","RB"],["DM","DM"],["LW","AM","RW"],["ST"]]],
  ["442", "4-4-2", [["GK"],["LB","CB","CB","RB"],["LM","CM","CM","RM"],["ST","ST"]]],
  ["343", "3-4-3", [["GK"],["CB","CB","CB"],["LWB","CM","CM","RWB"],["LW","ST","RW"]]],
  ["352", "3-5-2", [["GK"],["CB","CB","CB"],["LWB","CM","DM","CM","RWB"],["ST","ST"]]],
  ["4141", "4-1-4-1", [["GK"],["LB","CB","CB","RB"],["DM"],["LM","CM","CM","RM"],["ST"]]],
  ["4222", "4-2-2-2", [["GK"],["LB","CB","CB","RB"],["DM","DM"],["AM","AM"],["ST","ST"]]],
  ["4312", "4-3-1-2", [["GK"],["LB","CB","CB","RB"],["CM","DM","CM"],["AM"],["ST","ST"]]],
  ["41212", "4-1-2-1-2 Diamond", [["GK"],["LB","CB","CB","RB"],["DM"],["CM","CM"],["AM"],["ST","ST"]]],
  ["532", "5-3-2", [["GK"],["LWB","CB","CB","CB","RWB"],["CM","DM","CM"],["ST","ST"]]],
  ["523", "5-2-3", [["GK"],["LWB","CB","CB","CB","RWB"],["CM","CM"],["LW","ST","RW"]]],
  ["3421", "3-4-2-1", [["GK"],["CB","CB","CB"],["LWB","CM","CM","RWB"],["AM","AM"],["ST"]]],
  ["3412", "3-4-1-2", [["GK"],["CB","CB","CB"],["LWB","CM","CM","RWB"],["AM"],["ST","ST"]]],
  ["3511", "3-5-1-1", [["GK"],["CB","CB","CB"],["LWB","CM","DM","CM","RWB"],["SS"],["ST"]]],
  ["451", "4-5-1", [["GK"],["LB","CB","CB","RB"],["LM","CM","DM","CM","RM"],["ST"]]],
  ["4411", "4-4-1-1", [["GK"],["LB","CB","CB","RB"],["LM","CM","CM","RM"],["SS"],["ST"]]],
  ["424", "4-2-4", [["GK"],["LB","CB","CB","RB"],["CM","CM"],["LW","ST","ST","RW"]]],
  ["4132", "4-1-3-2", [["GK"],["LB","CB","CB","RB"],["DM"],["LM","CM","RM"],["ST","ST"]]],
  ["4321", "4-3-2-1 Christmas Tree", [["GK"],["LB","CB","CB","RB"],["CM","DM","CM"],["AM","AM"],["ST"]]],
  ["3331", "3-3-3-1", [["GK"],["CB","CB","CB"],["LM","DM","RM"],["LW","AM","RW"],["ST"]]],
  ["3142", "3-1-4-2", [["GK"],["CB","CB","CB"],["DM"],["LM","CM","CM","RM"],["ST","ST"]]],
  ["3241", "3-2-4-1", [["GK"],["CB","CB","CB"],["DM","DM"],["LM","AM","AM","RM"],["ST"]]],
  ["541", "5-4-1", [["GK"],["LWB","CB","CB","CB","RWB"],["LM","CM","CM","RM"],["ST"]]],
  ["5212", "5-2-1-2", [["GK"],["LWB","CB","CB","CB","RWB"],["CM","CM"],["AM"],["ST","ST"]]],
  ["5122", "5-1-2-2", [["GK"],["LWB","CB","CB","CB","RWB"],["DM"],["CM","CM"],["ST","ST"]]],
  ["42211", "4-2-2-1-1", [["GK"],["LB","CB","CB","RB"],["DM","DM"],["LW","RW"],["SS"],["ST"]]],
  ["4213", "4-2-1-3", [["GK"],["LB","CB","CB","RB"],["DM","DM"],["AM"],["LW","ST","RW"]]],
  ["4123", "4-1-2-3", [["GK"],["LB","CB","CB","RB"],["DM"],["CM","CM"],["LW","ST","RW"]]],
  ["42121", "4-2-1-2-1", [["GK"],["LB","CB","CB","RB"],["DM","DM"],["AM"],["LW","RW"],["ST"]]],
  ["4141wide", "4-1-4-1 Wide", [["GK"],["LB","CB","CB","RB"],["DM"],["LW","CM","CM","RW"],["ST"]]],
  ["433false9", "4-3-3 False 9", [["GK"],["LB","CB","CB","RB"],["CM","DM","CM"],["LW","SS","RW"]]],
  ["433dm", "4-3-3 Holding", [["GK"],["LB","CB","CB","RB"],["DM"],["CM","CM"],["LW","ST","RW"]]],
  ["433am", "4-3-3 Attacking", [["GK"],["LB","CB","CB","RB"],["CM","CM"],["AM"],["LW","ST","RW"]]],
  ["4231wide", "4-2-3-1 Wide", [["GK"],["LB","CB","CB","RB"],["DM","CM"],["LW","AM","RW"],["ST"]]],
  ["4231narrow", "4-2-3-1 Narrow", [["GK"],["LB","CB","CB","RB"],["DM","DM"],["AM","AM","AM"],["ST"]]],
  ["442diamond", "4-4-2 Diamond", [["GK"],["LB","CB","CB","RB"],["DM"],["CM","CM"],["AM"],["ST","ST"]]],
  ["442flat", "4-4-2 Flat", [["GK"],["LB","CB","CB","RB"],["LM","CM","CM","RM"],["ST","ST"]]],
  ["442compact", "4-4-2 Compact", [["GK"],["LB","CB","CB","RB"],["CM","DM","DM","CM"],["ST","ST"]]],
  ["352wide", "3-5-2 Wide", [["GK"],["CB","CB","CB"],["LWB","CM","DM","CM","RWB"],["ST","ST"]]],
  ["352flat", "3-5-2 Flat", [["GK"],["CB","CB","CB"],["LM","CM","DM","CM","RM"],["ST","ST"]]],
  ["343diamond", "3-4-3 Diamond", [["GK"],["CB","CB","CB"],["DM"],["LM","RM"],["AM"],["LW","ST","RW"]]],
  ["343flat", "3-4-3 Flat", [["GK"],["CB","CB","CB"],["LWB","CM","CM","RWB"],["LW","ST","RW"]]],
  ["361", "3-6-1", [["GK"],["CB","CB","CB"],["LWB","DM","CM","CM","AM","RWB"],["ST"]]],
  ["460", "4-6-0", [["GK"],["LB","CB","CB","RB"],["DM","CM","CM"],["LW","SS","RW"]]],
  ["550", "5-5-0", [["GK"],["LWB","CB","CB","CB","RWB"],["LM","CM","DM","CM","RM"]]],
  ["3223", "3-2-2-3", [["GK"],["CB","CB","CB"],["DM","DM"],["AM","AM"],["LW","ST","RW"]]],
  ["3133", "3-1-3-3", [["GK"],["CB","CB","CB"],["DM"],["LM","CM","RM"],["LW","ST","RW"]]],
  ["41131", "4-1-1-3-1", [["GK"],["LB","CB","CB","RB"],["DM"],["CM"],["LW","AM","RW"],["ST"]]],
  ["43111", "4-3-1-1-1", [["GK"],["LB","CB","CB","RB"],["CM","DM","CM"],["AM"],["SS"],["ST"]]],
  ["5221", "5-2-2-1", [["GK"],["LWB","CB","CB","CB","RWB"],["DM","DM"],["AM","AM"],["ST"]]]
];

const formations = formationSpecs.map(([id, label, rows]) => ({
  id,
  label,
  rows,
  slots: rows.flat().map((role) => roleEligibility[role]),
  referenceLineupId: id.startsWith("3") || id.startsWith("5") ? "value_442" : id.includes("4231") ? "creative_4231" : "pressing_433"
}));

const winReqMetrics = [
  ["Goals", "goalsAgainst", "goalsAgainst", "attack", ">=", ""],
  ["Shots", "shotsAgainst", "shotsAgainst", "attack", ">=", ""],
  ["Corners", "cornersAgainst", "cornersAgainst", "attack", ">=", ""],
  ["Corner shot creation", "cornerShotsAgainst", "cornerShotsAgainst", "attack", ">=", ""],
  ["Pass volume", "passesAgainst", "passesAgainst", "attack", ">=", ""],
  ["Pass percentage", "passPctAgainst", "passPctAgainst", "attack", ">=", "%"],
  ["Passes / attacking action", "passesPerAttackAgainst", "passesPerAttackAgainst", "attack", "<=", ""],
  ["Transition speed", "transitionAgainst", "transitionAgainst", "attack", "<=", "s"],
  ["Goals allowed", "goalsFor", "goalsFor", "defence", "<=", ""],
  ["Shots allowed", "shotsFor", "shotsFor", "defence", "<=", ""],
  ["Blocks", "blocks", "blocks", "defence", ">=", ""],
  ["Tackles", "tackles", "tackles", "defence", ">=", ""],
  ["Interceptions", "interceptions", "interceptions", "defence", ">=", ""],
  ["Duels won", "duels", "duels", "defence", ">=", "%"],
  ["Sprints", "sprints", "sprints", "physical", ">=", ""],
  ["Distance", "distance", "distance", "physical", ">=", "km"]
];

const curatedKeeperEvidence = [
  {
    goalkeeper: "Lemus Christopher", date: "2024-06-05", opponent: "Suriname", minute: 39,
    outcome: "conceded", situation: "penalty", shotOrigin: "Penalty spot", goalZone: "Low right",
    trajectoryObserved: true, evidenceQuality: "Secondary event text",
    evidenceUrl: "https://www.reddit.com/r/soccer/comments/1d911hj"
  },
  {
    goalkeeper: "Lemus Christopher", date: "2024-09-08", opponent: "Montserrat", minute: null,
    outcome: "saved-retaken", situation: "penalty", shotOrigin: "Penalty spot", goalZone: null,
    trajectoryObserved: false, evidenceQuality: "Biographical citation",
    evidenceUrl: "https://en.wikipedia.org/wiki/Lemus_Christopher"
  },
  {
    goalkeeper: "Lemus Christopher", date: "2024-09-08", opponent: "Montserrat", minute: null,
    outcome: "saved", situation: "penalty", shotOrigin: "Penalty spot", goalZone: null,
    trajectoryObserved: false, evidenceQuality: "Biographical citation",
    evidenceUrl: "https://en.wikipedia.org/wiki/Lemus_Christopher"
  }
];

const els = {
  fixtureSelect: document.querySelector("#fixtureSelect"),
  formationSelect: document.querySelector("#formationSelect"),
  winReqOpponent: document.querySelector("#winReqOpponent"),
  winReqVenue: document.querySelector("#winReqVenue"),
  sourceState: document.querySelector("#sourceState"),
  contextDomain: document.querySelector("#contextDomain"),
  contextCompetition: document.querySelector("#contextCompetition"),
  contextPlayer: document.querySelector("#contextPlayer"),
  refreshContext: document.querySelector("#refreshContext"),
  opponentContext: document.querySelector("#opponentContext"),
  contextConfidence: document.querySelector("#contextConfidence"),
  validatedPoints: document.querySelector("#validatedPoints"),
  disputedPoints: document.querySelector("#disputedPoints"),
  cacheState: document.querySelector("#cacheState"),
  sourceCoverage: document.querySelector("#sourceCoverage"),
  sourceStatusList: document.querySelector("#sourceStatusList"),
  contextIssues: document.querySelector("#contextIssues"),
  lineupSelect: document.querySelector("#lineupSelect"),
  nationSelect: document.querySelector("#nationSelect"),
  positionFilter: document.querySelector("#positionFilter"),
  playerSearch: document.querySelector("#playerSearch"),
  synergyRange: document.querySelector("#synergyRange"),
  synergyOutput: document.querySelector("#synergyOutput"),
  dbName: document.querySelector("#dbName"),
  playerCount: document.querySelector("#playerCount"),
  weightCount: document.querySelector("#weightCount"),
  fixtureTitle: document.querySelector("#fixtureTitle"),
  wabCovered: document.querySelector("#wabCovered"),
  xaviValue: document.querySelector("#xaviValue"),
  annualCost: document.querySelector("#annualCost"),
  density: document.querySelector("#density"),
  wabBars: document.querySelector("#wabBars"),
  networkCanvas: document.querySelector("#networkCanvas"),
  lineupRankings: document.querySelector("#lineupRankings"),
  dependencyList: document.querySelector("#dependencyList"),
  replacementList: document.querySelector("#replacementList"),
  playerTable: document.querySelector("#playerTable"),
  scoutingTitle: document.querySelector("#scoutingTitle"),
  scoutingCount: document.querySelector("#scoutingCount"),
  scoutingMeta: document.querySelector("#scoutingMeta"),
  scoutingTable: document.querySelector("#scoutingTable"),
  averageAge: document.querySelector("#averageAge"),
  overseasCount: document.querySelector("#overseasCount"),
  opponentTier: document.querySelector("#opponentTier"),
  visibleCount: document.querySelector("#visibleCount"),
  halfFieldScore: document.querySelector("#halfFieldScore"),
  fullFieldScore: document.querySelector("#fullFieldScore"),
  halfFieldClass: document.querySelector("#halfFieldClass"),
  fullFieldClass: document.querySelector("#fullFieldClass"),
  directnessInputs: document.querySelector("#directnessInputs"),
  directnessComparison: document.querySelector("#directnessComparison"),
  winReqTitle: document.querySelector("#winReqTitle"),
  attackLevel: document.querySelector("#attackLevel"),
  defenceLevel: document.querySelector("#defenceLevel"),
  transitionTarget: document.querySelector("#transitionTarget"),
  pdiScore: document.querySelector("#pdiScore"),
  winReqTable: document.querySelector("#winReqTable"),
  hotspotList: document.querySelector("#hotspotList"),
  assistList: document.querySelector("#assistList"),
  svgWeight: document.querySelector("#svgWeight"),
  opponentWeight: document.querySelector("#opponentWeight"),
  pitchLength: document.querySelector("#pitchLength"),
  pitchWidth: document.querySelector("#pitchWidth"),
  pitchCondition: document.querySelector("#pitchCondition"),
  opponentStrength: document.querySelector("#opponentStrength"),
  pdiCalories: document.querySelector("#pdiCalories"),
  pdiBreakdown: document.querySelector("#pdiBreakdown"),
  historyTitle: document.querySelector("#historyTitle"),
  historyCoverage: document.querySelector("#historyCoverage"),
  historyRecord: document.querySelector("#historyRecord"),
  historyGoals: document.querySelector("#historyGoals"),
  historyLast: document.querySelector("#historyLast"),
  historyWeather: document.querySelector("#historyWeather"),
  historyTable: document.querySelector("#historyTable"),
  keeperSelect: document.querySelector("#keeperSelect"),
  keeperLayer: document.querySelector("#keeperLayer"),
  keeperEvidenceState: document.querySelector("#keeperEvidenceState"),
  keeperTitle: document.querySelector("#keeperTitle"),
  keeperConceded: document.querySelector("#keeperConceded"),
  keeperTrajectory: document.querySelector("#keeperTrajectory"),
  keeperPenalties: document.querySelector("#keeperPenalties"),
  keeperMatches: document.querySelector("#keeperMatches"),
  keeperCanvas: document.querySelector("#keeperCanvas"),
  keeperSceneCount: document.querySelector("#keeperSceneCount"),
  resetKeeperCamera: document.querySelector("#resetKeeperCamera"),
  toggleKeeperMotion: document.querySelector("#toggleKeeperMotion"),
  keeperCoverageWarning: document.querySelector("#keeperCoverageWarning"),
  attackingKeeperInsights: document.querySelector("#attackingKeeperInsights"),
  defensiveKeeperInsights: document.querySelector("#defensiveKeeperInsights"),
  keeperEventCount: document.querySelector("#keeperEventCount"),
  keeperEventTable: document.querySelector("#keeperEventTable"),
  penaltyTable: document.querySelector("#penaltyTable"),
  gapCount: document.querySelector("#gapCount"),
  gapSelect: document.querySelector("#gapSelect"),
  gapList: document.querySelector("#gapList"),
  runGoblin: document.querySelector("#runGoblin"),
  goblinStatus: document.querySelector("#goblinStatus"),
  goblinResearchSummary: document.querySelector("#goblinResearchSummary"),
  goblinResearchTrace: document.querySelector("#goblinResearchTrace"),
  clipMatchCount: document.querySelector("#clipMatchCount"),
  clipSource: document.querySelector("#clipSource"),
  clipSearch: document.querySelector("#clipSearch"),
  searchClips: document.querySelector("#searchClips"),
  youtubeApiKey: document.querySelector("#youtubeApiKey"),
  clipResults: document.querySelector("#clipResults"),
  clipPreview: document.querySelector("#clipPreview"),
  wizardGap: document.querySelector("#wizardGap"),
  wizardClipUrl: document.querySelector("#wizardClipUrl"),
  wizardClipTime: document.querySelector("#wizardClipTime"),
  wizardMinute: document.querySelector("#wizardMinute"),
  wizardSituation: document.querySelector("#wizardSituation"),
  wizardOutcome: document.querySelector("#wizardOutcome"),
  wizardOrigin: document.querySelector("#wizardOrigin"),
  wizardGoalZone: document.querySelector("#wizardGoalZone"),
  wizardEvidenceState: document.querySelector("#wizardEvidenceState"),
  wizardStatus: document.querySelector("#wizardStatus"),
  runVideoModel: document.querySelector("#runVideoModel"),
  saveKeeperAction: document.querySelector("#saveKeeperAction"),
  serverServiceState: document.querySelector("#serverServiceState"),
  broadcastFile: document.querySelector("#broadcastFile"),
  transcribeBroadcast: document.querySelector("#transcribeBroadcast"),
  inferCommentary: document.querySelector("#inferCommentary"),
  broadcastStage: document.querySelector("#broadcastStage"),
  broadcastVideo: document.querySelector("#broadcastVideo"),
  trackingCanvas: document.querySelector("#trackingCanvas"),
  broadcastTimeline: document.querySelector("#broadcastTimeline"),
  timelineCurrent: document.querySelector("#timelineCurrent"),
  addTimelineMarker: document.querySelector("#addTimelineMarker"),
  timelineMarkers: document.querySelector("#timelineMarkers"),
  pitchLandmark: document.querySelector("#pitchLandmark"),
  broadcastTrackId: document.querySelector("#broadcastTrackId"),
  undoTrackingPoint: document.querySelector("#undoTrackingPoint"),
  runAutoTracking: document.querySelector("#runAutoTracking"),
  inferTrackedGoals: document.querySelector("#inferTrackedGoals"),
  trackingStatus: document.querySelector("#trackingStatus"),
  broadcastTranscript: document.querySelector("#broadcastTranscript"),
  broadcastCandidateCount: document.querySelector("#broadcastCandidateCount"),
  broadcastCandidates: document.querySelector("#broadcastCandidates"),
  pathNation: document.querySelector("#pathNation"),
  pathDestination: document.querySelector("#pathDestination"),
  pathQualification: document.querySelector("#pathQualification"),
  pathTitle: document.querySelector("#pathTitle"),
  pathCompleted: document.querySelector("#pathCompleted"),
  pathRemaining: document.querySelector("#pathRemaining"),
  pathHighest: document.querySelector("#pathHighest"),
  pathAirport: document.querySelector("#pathAirport"),
  pathTable: document.querySelector("#pathTable"),
  pathPlayer: document.querySelector("#pathPlayer"),
  pathPlayerTitle: document.querySelector("#pathPlayerTitle"),
  pathRouteSource: document.querySelector("#pathRouteSource"),
  pathRoute: document.querySelector("#pathRoute"),
  pathRouteMeta: document.querySelector("#pathRouteMeta"),
  pathDistance: document.querySelector("#pathDistance"),
  pathOneWay: document.querySelector("#pathOneWay"),
  pathLocationBasis: document.querySelector("#pathLocationBasis"),
  transferClub: document.querySelector("#transferClub"),
  transferAirport: document.querySelector("#transferAirport"),
  applyTransfer: document.querySelector("#applyTransfer"),
  pathSources: document.querySelector("#pathSources")
};

const formatMoney = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
  notation: "compact"
});

const formatFullMoney = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0
});

const percent = (value, digits = 0) => `${(value * 100).toFixed(digits)}%`;
const number = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : "0.00";

init();

async function init() {
  const [response, u20Response, contextResponse, pathResponse] = await Promise.all([
    fetch("data/padagonia-db.json"),
    fetch("data/concacaf-u20-pools.json"),
    fetch("data/context-sources.json"),
    fetch("data/path-config.json")
  ]);
  state.db = await response.json();
  state.u20Pools = await u20Response.json();
  const contextConfig = await contextResponse.json();
  const pathConfig = await pathResponse.json();
  state.pathTracker = new PathTracker(pathConfig);
  state.contextBroker = new ContextBroker(contextConfig);
  state.contextBroker.register("padagonia", buildPadagoniaContextRecords);
  state.contextBroker.register("svg-history", buildHistoricalContextRecords);
  state.contextBroker.register("wikipedia", fetchWikipediaContext);
  ["bbc-sport", "livescore", "plaintext-scores"].forEach((sourceId) => {
    state.contextBroker.register(sourceId, readManualSourceRecords);
  });
  window.aviContextBroker = state.contextBroker;
  window.aviIngestSourceRecords = ingestSourceRecords;
  window.aviPathTracker = state.pathTracker;
  window.aviIngestFlightOptions = (options) => {
    state.pathTracker.ingestFlightOptions(options);
    renderPath();
    return options.length;
  };
  window.aviIngestPathSchedules = (records) => {
    state.pathTracker.ingestScheduleRecords(records);
    renderPath();
    return records.length;
  };
  window.aviIngestGoalkeeperEvents = ingestGoalkeeperEvents;
  window.aviRegisterGoblinAdapter = (adapter) => {
    if (typeof adapter !== "function") throw new Error("Goblin adapter must be a function");
    state.goblinAdapter = adapter;
    els.goblinStatus.textContent = "Goblin adapter connected.";
  };
  window.aviRegisterVideoModelAdapter = (adapter) => {
    if (typeof adapter !== "function") throw new Error("Video model adapter must be a function");
    state.videoModelAdapter = adapter;
    els.wizardStatus.textContent = "Video-in adapter connected.";
  };
  window.aviRegisterBroadcastTracker = (adapter) => {
    if (typeof adapter !== "function") throw new Error("Broadcast tracker adapter must be a function");
    state.broadcastTrackingAdapter = adapter;
    els.trackingStatus.textContent = "Authorised broadcast tracker connected.";
  };
  state.fixtureId = state.db.fixtures[0].id;
  hydrateControls();
  els.opponentStrength.value = number(buildWinReqProfile(state.winReqOpponent, els.winReqVenue.value).strength, 2);
  bindEvents();
  refreshOptimizedLineup();
  render();
  checkEvidenceServer();
  if (window.location.hash === "#analysis") setView("analysis");
  if (window.location.hash === "#winreq") setView("winreq");
  if (window.location.hash === "#keepers") setView("keepers");
  if (window.location.hash === "#path") setView("path");
}

function hydrateControls() {
  els.dbName.textContent = "AVI model";
  els.playerCount.textContent = state.db.players.length;
  els.weightCount.textContent = state.db.actions.length;

  els.fixtureSelect.innerHTML = state.db.fixtures
    .map((fixture) => `<option value="${fixture.id}">${fixture.label}</option>`)
    .join("");
  els.formationSelect.innerHTML = formations
    .map((formation) => `<option value="${formation.id}">${formation.label}</option>`)
    .join("");
  els.nationSelect.innerHTML = state.u20Pools.countries
    .map((entry) => `<option value="${entry.country}">${entry.flag} ${entry.country}</option>`)
    .join("");
  els.winReqOpponent.innerHTML = state.u20Pools.countries
    .filter((entry) => entry.country !== "Saint Vincent and the Grenadines")
    .map((entry) => `<option value="${entry.country}">${entry.flag} ${entry.country}</option>`)
    .join("");
  els.winReqOpponent.value = state.winReqOpponent;
  els.pathNation.innerHTML = state.u20Pools.countries
    .map((entry) => `<option value="${entry.country}">${entry.flag} ${entry.country}</option>`)
    .join("");
  els.pathDestination.innerHTML = state.u20Pools.countries
    .filter((entry) => state.pathTracker.config.destinationByCountry[entry.country])
    .map((entry) => `<option value="${entry.country}">${entry.flag} ${entry.country}</option>`)
    .join("");
  els.pathNation.value = "Saint Vincent and the Grenadines";
  els.pathDestination.value = "Saint Vincent and the Grenadines";
  els.transferAirport.innerHTML = [...state.pathTracker.airports.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((airport) => `<option value="${airport.code}">${airport.code} · ${airport.name}</option>`)
    .join("");
  hydratePathPlayers();
  hydrateKeeperControls();
  els.pitchLandmark.innerHTML = Object.entries(pitchLandmarks)
    .map(([id, landmark]) => `<option value="${id}">${landmark.label}</option>`)
    .join("");
  hydrateContextPlayers();
  if ([...els.nationSelect.options].some((option) => option.value === "Saint Vincent and the Grenadines")) {
    els.nationSelect.value = "Saint Vincent and the Grenadines";
  }
}

function bindEvents() {
  els.fixtureSelect.addEventListener("change", (event) => {
    state.fixtureId = event.target.value;
    refreshOptimizedLineup();
    render();
  });

  els.formationSelect.addEventListener("change", (event) => {
    state.formationId = event.target.value;
    refreshOptimizedLineup();
    render();
  });

  els.nationSelect.addEventListener("change", renderScoutingPool);
  els.positionFilter.addEventListener("change", renderScoutingPool);
  els.playerSearch.addEventListener("input", renderScoutingPool);
  els.winReqOpponent.addEventListener("change", (event) => {
    state.winReqOpponent = event.target.value;
    els.opponentStrength.value = number(buildWinReqProfile(event.target.value, els.winReqVenue.value).strength, 2);
    hydrateContextPlayers();
    renderWinReq();
    refreshSourceContext();
  });
  [els.winReqVenue, els.svgWeight, els.opponentWeight, els.pitchLength, els.pitchWidth, els.pitchCondition, els.opponentStrength]
    .forEach((control) => control.addEventListener("input", renderWinReq));
  els.winReqVenue.addEventListener("change", () => refreshSourceContext());
  [els.contextDomain, els.contextCompetition, els.contextPlayer]
    .forEach((control) => control.addEventListener("change", () => refreshSourceContext()));
  els.refreshContext.addEventListener("click", () => refreshSourceContext({ force: true }));
  els.pathNation.addEventListener("change", () => {
    state.pathPlayerName = null;
    hydratePathPlayers();
    renderPath();
  });
  [els.pathDestination, els.pathQualification].forEach((control) => control.addEventListener("change", renderPath));
  els.pathPlayer.addEventListener("change", (event) => {
    state.pathPlayerName = event.target.value;
    renderPathDetail();
  });
  els.applyTransfer.addEventListener("click", () => {
    if (!state.pathPlayerName || !els.transferClub.value.trim()) return;
    state.pathTracker.applyTransfer(state.pathPlayerName, els.transferClub.value.trim(), els.transferAirport.value);
    renderPath();
  });
  els.keeperSelect.addEventListener("change", (event) => {
    state.keeperName = event.target.value;
    renderKeeperAnalysis();
  });
  els.keeperLayer.addEventListener("change", (event) => {
    state.keeperLayer = event.target.value;
    renderKeeperAnalysis();
  });
  els.resetKeeperCamera.addEventListener("click", () => state.keeperScene?.resetCamera());
  els.toggleKeeperMotion.addEventListener("click", () => {
    state.keeperScenePaused = !state.keeperScenePaused;
    state.keeperScene?.setPaused(state.keeperScenePaused);
    els.toggleKeeperMotion.textContent = state.keeperScenePaused ? "▶" : "Ⅱ";
    els.toggleKeeperMotion.title = state.keeperScenePaused ? "Resume trajectory motion" : "Pause trajectory motion";
    els.toggleKeeperMotion.setAttribute("aria-label", els.toggleKeeperMotion.title);
  });
  els.gapSelect.addEventListener("change", (event) => selectKeeperGap(event.target.value));
  els.wizardGap.addEventListener("change", (event) => selectKeeperGap(event.target.value));
  els.runGoblin.addEventListener("click", runGoblinCollation);
  els.searchClips.addEventListener("click", findKeeperClips);
  els.runVideoModel.addEventListener("click", runVideoModel);
  els.saveKeeperAction.addEventListener("click", saveKeeperAction);
  els.broadcastFile.addEventListener("change", loadBroadcastFile);
  els.broadcastVideo.addEventListener("loadedmetadata", initializeBroadcastTimeline);
  els.broadcastVideo.addEventListener("timeupdate", syncBroadcastTimeline);
  els.broadcastVideo.addEventListener("seeked", drawTrackingOverlay);
  els.broadcastTimeline.addEventListener("input", (event) => {
    if (Number.isFinite(els.broadcastVideo.duration)) els.broadcastVideo.currentTime = Number(event.target.value);
  });
  els.addTimelineMarker.addEventListener("click", () => {
    state.broadcastTracker.addMarker(els.broadcastVideo.currentTime || 0);
    renderTimelineMarkers();
  });
  document.querySelectorAll("[data-track-tool]").forEach((button) => {
    button.addEventListener("click", () => selectBroadcastTool(button.dataset.trackTool));
  });
  els.trackingCanvas.addEventListener("pointerdown", addTrackingObservation);
  els.undoTrackingPoint.addEventListener("click", () => {
    state.broadcastTracker.undoLast();
    drawTrackingOverlay();
    renderTimelineMarkers();
  });
  els.runAutoTracking.addEventListener("click", runBroadcastTracking);
  els.inferTrackedGoals.addEventListener("click", inferTrackedGoals);
  els.transcribeBroadcast.addEventListener("click", transcribeBroadcast);
  els.inferCommentary.addEventListener("click", inferCommentaryActions);

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewTarget));
  });

  els.synergyRange.addEventListener("input", (event) => {
    state.synergyWeight = Number(event.target.value);
    els.synergyOutput.textContent = `${state.synergyWeight.toFixed(2)}x`;
    refreshOptimizedLineup();
    render();
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      render();
    });
  });
}

function setView(view) {
  state.activeView = view;
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.classList.toggle("active", button.dataset.viewTarget === view);
  });
  document.querySelectorAll("[data-view]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.view === view);
  });
  const hash = view === "analysis" ? "#analysis" : view === "winreq" ? "#winreq" : view === "keepers" ? "#keepers" : view === "path" ? "#path" : window.location.pathname;
  window.history.replaceState(null, "", hash);
  els.sourceState.innerHTML = view === "analysis"
    ? "<span>●</span> AVI model · 50 formations"
    : view === "winreq"
      ? `<span>●</span> History-linked · ${state.db.historicalFixtures?.length ?? 0} SVG fixtures`
      : view === "keepers"
        ? "<span>●</span> Keeper Lab · attributed event evidence"
        : view === "path"
        ? "<span>●</span> PATH · schedule and route model"
        : "<span>●</span> Official U20 pool · 2026";
  if (view === "analysis") {
    requestAnimationFrame(() => renderNetwork(calculateLineupModel(getLineup(), getFixture())));
  }
  if (view === "winreq") refreshSourceContext();
  if (view === "path") renderPath();
  if (view === "keepers") renderKeeperAnalysis();
}

function render() {
  const fixture = getFixture();
  const lineup = getLineup();
  const model = calculateLineupModel(lineup, fixture);
  const allLineups = formations
    .map((formation) => calculateLineupModel(optimizeFormation(formation, fixture), fixture))
    .sort((a, b) => b.xavi - a.xavi);

  els.fixtureTitle.textContent = fixture.label;
  els.wabCovered.textContent = percent(model.coverageRatio);
  els.xaviValue.textContent = number(model.xavi);
  els.annualCost.textContent = formatMoney.format(model.annualCost);
  els.density.textContent = percent(model.networkDensity);

  renderBars(model);
  renderNetwork(model);
  renderRankings(allLineups);
  renderDependency(model);
  renderReplacement(model, fixture);
  renderPlayers(model);
  renderDirectness(lineup);
  renderScoutingPool();
  renderWinReq();
  renderPath();
  renderKeeperAnalysis();
}

function renderScoutingPool() {
  const entry = state.u20Pools.countries.find((team) => team.country === els.nationSelect.value)
    ?? state.u20Pools.countries[0];
  const position = els.positionFilter.value;
  const search = els.playerSearch.value.trim().toLocaleLowerCase();
  const players = entry.players.filter((player) => {
    const matchesPosition = position === "all" || player.position === position;
    const matchesSearch = !search || `${player.name} ${player.club}`.toLocaleLowerCase().includes(search);
    return matchesPosition && matchesSearch;
  });
  const ages = entry.players.map((player) => ageOnDate(player.dateOfBirth));
  const homeCode = nationalityCode(entry.country);
  const overseas = entry.players.filter((player) => {
    const clubCode = player.club.match(/\(([A-Z]{3})\)\s*$/)?.[1];
    return clubCode && clubCode !== homeCode;
  }).length;
  els.scoutingTitle.textContent = `${entry.flag} ${entry.country} U20 Call-up Pool`;
  els.scoutingCount.textContent = entry.players.length;
  els.scoutingMeta.textContent = `${entry.competition} · Official roster source`;
  els.averageAge.textContent = number(ages.reduce((sum, age) => sum + age, 0) / ages.length, 1);
  els.overseasCount.textContent = overseas;
  els.opponentTier.textContent = opponentTier(entry.country);
  els.visibleCount.textContent = `${players.length} shown`;
  els.scoutingTable.innerHTML = players.map((player) => `
    <tr>
      <td><strong>${player.name}</strong></td>
      <td><span class="position">${positionSymbol(player.position)} ${player.position}</span></td>
      <td>${player.flag} ${player.nationality}</td>
      <td>${ageOnDate(player.dateOfBirth)}</td>
      <td>${player.club}</td>
      <td>${player.nationality === "Saint Vincent and the Grenadines" ? "Not verified" : "—"}</td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="empty-state">No players match these filters.</td></tr>`;
}

function hydratePathPlayers() {
  const entry = state.u20Pools.countries.find((team) => team.country === els.pathNation.value)
    ?? state.u20Pools.countries[0];
  if (!state.pathPlayerName || !entry.players.some((player) => player.name === state.pathPlayerName)) {
    state.pathPlayerName = entry.players[0]?.name ?? null;
  }
  els.pathPlayer.innerHTML = entry.players
    .map((player) => `<option value="${player.name}">${positionSymbol(player.position)} ${player.name}</option>`)
    .join("");
  els.pathPlayer.value = state.pathPlayerName;
}

function renderPath() {
  if (!state.pathTracker || !state.u20Pools || !els.pathNation.value) return;
  const entry = state.u20Pools.countries.find((team) => team.country === els.pathNation.value)
    ?? state.u20Pools.countries[0];
  const destination = state.pathTracker.config.destinationByCountry[els.pathDestination.value] ?? "SVD";
  state.pathResults = entry.players
    .map((player) => state.pathTracker.calculatePlayer(player, destination, els.pathQualification.value))
    .sort((a, b) => b.predictedHours - a.predictedHours);
  const completed = state.pathResults.reduce((sum, result) => sum + result.cumulativeHours, 0);
  const remaining = state.pathResults.reduce((sum, result) => sum + result.predictedHours, 0);
  const highest = state.pathResults[0];
  const flag = entry.flag ?? "";

  els.pathTitle.textContent = `${flag} ${entry.country} travel-load forecast`;
  els.pathCompleted.textContent = `${number(completed, 0)}h`;
  els.pathRemaining.textContent = `${number(remaining, 0)}h`;
  els.pathHighest.textContent = highest ? surname(highest.player.name) : "—";
  els.pathAirport.textContent = destination;
  els.pathTable.innerHTML = state.pathResults.map((result) => {
    const route = result.inbound.airports.join(" → ");
    const selected = result.player.name === state.pathPlayerName;
    return `<tr data-path-player="${result.player.name}" aria-selected="${selected}">
      <td><strong>${result.player.flag ?? entry.flag} ${result.player.name}</strong><small>${positionSymbol(result.player.position)} ${result.player.position}</small></td>
      <td>${result.origin.club}<small>${result.origin.airport} · ${result.origin.basis}</small></td>
      <td>${route}<small>${number(result.inbound.distanceKm, 0)} km one-way</small></td>
      <td>${number(result.cumulativeHours, 1)}h<small>${number(result.cumulativeKm, 0)} km</small></td>
      <td>${number(result.remainingClubHours, 1)}h<small>${result.remainingClubAway} away trips</small></td>
      <td>${number(result.remainingInternationalHours, 1)}h<small>${result.remainingInternational} return trips</small></td>
      <td><span class="travel-value">${number(result.predictedHours, 1)}h</span></td>
      <td><span class="coverage-tag ${result.scheduleBasis === "modelled" ? "inferred" : ""}">${result.scheduleBasis === "ingested" ? (result.inbound.estimated ? "Schedule" : "Schedule + API") : "Modelled"}</span></td>
    </tr>`;
  }).join("");
  els.pathTable.querySelectorAll("[data-path-player]").forEach((row) => {
    row.addEventListener("click", () => {
      state.pathPlayerName = row.dataset.pathPlayer;
      els.pathPlayer.value = state.pathPlayerName;
      renderPath();
    });
  });
  renderPathDetail();
  renderPathSources();
}

function renderPathDetail() {
  const result = state.pathResults.find((candidate) => candidate.player.name === state.pathPlayerName)
    ?? state.pathResults[0];
  if (!result) return;
  state.pathPlayerName = result.player.name;
  els.pathPlayer.value = result.player.name;
  els.pathPlayerTitle.textContent = `${result.player.flag ?? ""} ${result.player.name}`.trim();
  els.pathRouteSource.textContent = result.inbound.estimated ? "Estimated route" : `${result.inbound.source} flight option`;
  els.pathRoute.innerHTML = result.inbound.airports
    .map((airport, index) => `${index ? '<span class="route-arrow">→</span>' : ""}<span class="route-stop">${airport}</span>`)
    .join("");
  els.pathRouteMeta.textContent = result.inbound.estimated
    ? "Fastest connected path in the local airport graph, including modelled connection and ground-handling time."
    : "Shortest matching itinerary from the authorised flight-option cache.";
  els.pathDistance.textContent = `${number(result.inbound.distanceKm, 0)} km`;
  els.pathOneWay.textContent = `${number(result.inbound.durationHours, 1)}h`;
  els.pathLocationBasis.textContent = result.origin.basis;
  els.transferClub.value = result.origin.club;
  els.transferAirport.value = result.origin.airport;
}

function renderPathSources() {
  els.pathSources.innerHTML = state.pathTracker.config.flightSources.map((source) => {
    const active = source.id === "route-model" || state.pathTracker.flightOptions.some((option) => option.source === source.id);
    const detail = source.id === "amadeus"
      ? "Credentialled schedule and offer adapter"
      : source.id === "opensky"
        ? "Observed movements; not a commercial timetable"
        : "Connected-airport fallback with estimated durations";
    return `<div class="source-note"><span><strong>${source.label}</strong><small>${detail}</small></span><span class="coverage-tag ${active ? "" : "inferred"}">${active ? "Active" : "Not loaded"}</span></div>`;
  }).join("");
}

function surname(name) {
  return name.trim().split(/\s+/).at(-1);
}

function goalkeeperEvidence() {
  const imported = (state.db?.historicalFixtures ?? []).flatMap((fixture) => {
    const analysis = fixture.goalkeeperAnalysis;
    if (!analysis?.goalkeeper) return [];
    return analysis.events.map((event) => ({
      ...event,
      goalkeeper: analysis.goalkeeper,
      date: fixture.date,
      opponent: fixture.opponent,
      outcome: "conceded",
      matchId: fixture.id,
      evidenceQuality: `${Math.round(analysis.eventCoverage * 100)}% report event coverage`
    }));
  });
  let local = [];
  try { local = JSON.parse(localStorage.getItem("avi-goalkeeper-events") ?? "[]"); } catch { local = []; }
  const merged = new Map();
  for (const event of [...imported, ...curatedKeeperEvidence, ...local]) {
    const key = [event.goalkeeper, event.date, event.minute ?? "unknown", event.situation, event.outcome].join("|");
    merged.set(key, { ...(merged.get(key) ?? {}), ...event });
  }
  return [...merged.values()];
}

function hydrateKeeperControls() {
  const names = [...new Set([
    ...goalkeeperEvidence().map((event) => event.goalkeeper),
    ...(state.db?.historicalFixtures ?? []).map((fixture) => fixture.goalkeeperAnalysis?.goalkeeper).filter(Boolean)
  ])].sort();
  if (!names.includes(state.keeperName)) state.keeperName = names[0] ?? "Lemus Christopher";
  els.keeperSelect.innerHTML = names.map((name) => `<option value="${name}">🧤 ${name}</option>`).join("");
  els.keeperSelect.value = state.keeperName;
}

function ingestGoalkeeperEvents(records) {
  if (!Array.isArray(records) || records.some((record) => !record.goalkeeper || !record.date || !record.outcome)) {
    throw new Error("Goalkeeper records require goalkeeper, date and outcome fields");
  }
  let existing = [];
  try { existing = JSON.parse(localStorage.getItem("avi-goalkeeper-events") ?? "[]"); } catch { existing = []; }
  localStorage.setItem("avi-goalkeeper-events", JSON.stringify([...existing, ...records]));
  hydrateKeeperControls();
  renderKeeperAnalysis();
  return records.length;
}

function renderKeeperAnalysis() {
  if (!state.db || !els.keeperSelect?.options.length) return;
  const all = goalkeeperEvidence().filter((event) => event.goalkeeper === state.keeperName);
  const conceded = all.filter((event) => event.outcome === "conceded");
  const penalties = all.filter((event) => event.situation === "penalty");
  const filtered = all.filter((event) => state.keeperLayer === "all" || event.situation === state.keeperLayer)
    .filter((event) => event.outcome === "conceded")
    .sort((a, b) => b.date.localeCompare(a.date) || (b.minute ?? 0) - (a.minute ?? 0));
  const trajectory = conceded.filter((event) => event.trajectoryObserved && event.shotOrigin && event.goalZone);
  const attributedMatches = (state.db.historicalFixtures ?? []).filter((fixture) => fixture.goalkeeperAnalysis?.goalkeeper === state.keeperName);

  els.keeperTitle.textContent = `🧤 ${state.keeperName} training profile`;
  els.keeperConceded.textContent = conceded.length;
  els.keeperTrajectory.textContent = conceded.length ? percent(trajectory.length / conceded.length) : "0%";
  els.keeperPenalties.textContent = penalties.length;
  els.keeperMatches.textContent = attributedMatches.length;
  els.keeperEvidenceState.textContent = trajectory.length >= 8 ? "Directional sample" : "Evidence constrained";
  els.keeperEventCount.textContent = `${filtered.length} events`;
  els.keeperCoverageWarning.textContent = trajectory.length >= 8
    ? `${trajectory.length} observed trajectories support directional pattern analysis.`
    : `Only ${trajectory.length} of ${conceded.length} attributed goals has a coded origin and goal zone. Directional recommendations remain low-confidence until video events are added.`;

  els.keeperEventTable.innerHTML = filtered.map((event) => `<tr>
    <td>${formatFixtureDate(event.date)}</td><td>${event.opponent ?? "Unknown"}</td><td>${event.minute == null ? "—" : `${event.minute}'`}</td>
    <td>${event.situation ?? "Unclassified"}</td><td>${event.shotOrigin ?? "Not coded"}</td><td>${event.goalZone ?? "Not coded"}</td>
    <td><span class="coverage-tag ${event.trajectoryObserved ? "" : "inferred"}">${event.trajectoryObserved ? "Observed" : "Event only"}</span><small>${event.evidenceQuality ?? event.source ?? "Imported"}</small></td>
  </tr>`).join("") || `<tr><td colspan="7" class="empty-state">No conceded events match this layer.</td></tr>`;

  els.penaltyTable.innerHTML = penalties.sort((a, b) => b.date.localeCompare(a.date)).map((event) => `<tr>
    <td>${formatFixtureDate(event.date)}</td><td>${event.opponent ?? "Unknown"}</td><td><strong>${event.outcome.replaceAll("-", " ")}</strong></td>
    <td>${event.goalZone ?? "Direction not coded"}</td><td><span class="coverage-tag ${event.trajectoryObserved ? "" : "inferred"}">${event.evidenceQuality ?? "Event evidence"}</span></td>
    <td>${event.outcome === "saved-retaken" ? "Rehearse line discipline without sacrificing first movement." : event.outcome === "saved" ? "Retain the delayed-read penalty routine." : "Recreate the observed placement in penalty finishing and save practice."}</td>
  </tr>`).join("") || `<tr><td colspan="6" class="empty-state">No penalty evidence is attributed to this goalkeeper.</td></tr>`;

  renderKeeperInsights(all, trajectory);
  renderKeeperScene(filtered.filter((event) => event.trajectoryObserved && event.shotOrigin && event.goalZone));
  renderKeeperIngress();
}

function renderKeeperInsights(all, trajectory) {
  const penalties = all.filter((event) => event.situation === "penalty");
  const saves = penalties.filter((event) => event.outcome.startsWith("saved")).length;
  const concededPenalties = penalties.filter((event) => event.outcome === "conceded").length;
  const zones = countBy(trajectory, (event) => event.goalZone);
  const origins = countBy(trajectory, (event) => event.shotOrigin);
  const topZone = [...zones].sort((a, b) => b[1] - a[1])[0];
  const topOrigin = [...origins].sort((a, b) => b[1] - a[1])[0];
  const directionText = topZone
    ? `${topOrigin?.[0] ?? "Known origin"} to ${topZone[0]} appears ${topZone[1]} time${topZone[1] === 1 ? "" : "s"}. ${trajectory.length < 8 ? "Treat this as a recreation target, not a stable weakness." : "Prioritise this repeated finishing route."}`
    : "No repeatable shot trajectory is currently coded. Use goal video to tag origin, height, lateral zone, body part and assist type before prescribing an aim point.";
  els.attackingKeeperInsights.innerHTML = `<div class="insight-block attack"><strong>Attacking shot plan</strong>${directionText}</div>`;
  els.defensiveKeeperInsights.innerHTML = `
    <div class="insight-block"><strong>Keeper protection plan</strong>${saves || concededPenalties ? `Known penalties: ${saves} saved actions and ${concededPenalties} conceded. Rehearse delayed reads, explosive first step and line-compliant take-off.` : "Penalty outcome evidence is insufficient for a keeper-specific routine."}</div>
    <div class="insight-block"><strong>Cross and duel strategy</strong>Cross claims, aerial duel wins and post-shot xG are not present in the public result feed. The model will not claim this keeper is stronger at duels or shot stopping until those events are ingested.</div>`;
}

function renderKeeperScene(events) {
  if (!state.keeperScene) state.keeperScene = new KeeperFinalThirdScene(els.keeperCanvas);
  state.keeperScene.setEvents(events);
  state.keeperScene.setPaused(state.keeperScenePaused);
  els.keeperSceneCount.textContent = `${events.length} coded path${events.length === 1 ? "" : "s"}`;
  if (state.activeView === "keepers") requestAnimationFrame(() => state.keeperScene.resize());
}

function renderKeeperIngress() {
  const resolved = new Set(goalkeeperEvidence()
    .filter((event) => event.gapId && event.outcome === "conceded")
    .map((event) => event.gapId));
  state.keeperGaps = buildKeeperEvidenceGaps(state.db?.historicalFixtures, state.keeperName)
    .filter((gap) => !resolved.has(gap.id));
  if (!state.keeperGaps.some((gap) => gap.id === state.selectedGapId)) {
    state.selectedGapId = state.keeperGaps[0]?.id ?? null;
  }
  const options = state.keeperGaps.map((gap) => `<option value="${gap.id}">${formatFixtureDate(gap.date)} · ${gap.opponent} · ${gap.type}</option>`).join("");
  els.gapCount.textContent = `${state.keeperGaps.length} gap${state.keeperGaps.length === 1 ? "" : "s"}`;
  els.gapSelect.innerHTML = options || `<option value="">No open gaps</option>`;
  els.wizardGap.innerHTML = options || `<option value="">No open gaps</option>`;
  els.gapSelect.value = state.selectedGapId ?? "";
  els.wizardGap.value = state.selectedGapId ?? "";
  els.gapList.innerHTML = state.keeperGaps.slice(0, 12).map((gap) => `<button class="gap-row" type="button" data-gap-id="${gap.id}" aria-selected="${gap.id === state.selectedGapId}"><span><strong>${formatFixtureDate(gap.date)} · ${escapeHtml(gap.opponent)}</strong><small>${escapeHtml(gap.reason)}</small></span><span class="gap-priority">P${gap.priority}</span></button>`).join("") || `<div class="empty-state">No unresolved goalkeeper evidence gaps.</div>`;
  els.gapList.querySelectorAll("[data-gap-id]").forEach((button) => {
    button.addEventListener("click", () => selectKeeperGap(button.dataset.gapId));
  });
  const selected = selectedKeeperGap();
  if (selected && !els.clipSearch.value.trim()) els.clipSearch.value = selected.query;
}

function selectedKeeperGap() {
  return state.keeperGaps.find((gap) => gap.id === state.selectedGapId) ?? null;
}

function selectKeeperGap(gapId) {
  state.selectedGapId = gapId || null;
  const gap = selectedKeeperGap();
  els.gapSelect.value = gap?.id ?? "";
  els.wizardGap.value = gap?.id ?? "";
  if (gap) {
    els.clipSearch.value = gap.query;
    els.wizardMinute.value = gap.minute ?? "";
  }
  els.gapList.querySelectorAll("[data-gap-id]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.gapId === state.selectedGapId));
  });
}

async function runGoblinCollation() {
  const gap = selectedKeeperGap();
  if (!gap) return;
  const packet = buildGoblinCollationPacket(gap);
  els.runGoblin.disabled = true;
  try {
    els.goblinStatus.textContent = "Goblin compound research running: scope → discover → corroborate → synthesise…";
    let result;
    try {
      result = state.goblinAdapter
        ? await state.goblinAdapter(packet)
        : await fetchJson("/api/goblin/research", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(packet)
          });
    } catch (agentError) {
      if (state.goblinAdapter) throw agentError;
      let queue = [];
      try { queue = JSON.parse(localStorage.getItem("avi-goblin-ingress-queue") ?? "[]"); } catch { queue = []; }
      localStorage.setItem("avi-goblin-ingress-queue", JSON.stringify([...queue.filter((item) => item.gap.id !== gap.id), packet]));
      els.goblinStatus.textContent = `Research agent unavailable; gap packet queued locally. ${agentError.message}`;
      return;
    }
    state.goblinResearch = result;
    const suggestion = Array.isArray(result) ? result[0] : result?.suggestion ?? result;
    if (suggestion?.shotOrigin && suggestion?.goalZone) applyVideoSuggestion(suggestion, "Goblin compound research");
    if (result?.clips?.length) renderClipMatches(result.clips);
    renderGoblinResearch(result);
    els.goblinStatus.textContent = "Compound research completed; all output remains provisional pending analyst review.";
  } catch (error) {
    els.goblinStatus.textContent = `Collation failed: ${error.message}`;
  } finally {
    els.runGoblin.disabled = false;
  }
}

function renderGoblinResearch(result) {
  const sources = result?.sourceRuns ?? [];
  const completed = sources.filter((source) => source.status === "completed").length;
  const confidence = Math.round(Number(result?.confidence ?? 0) * 100);
  els.goblinResearchSummary.textContent = `${completed}/${sources.length} sources · ${result?.evidence?.length ?? 0} evidence items · ${result?.clips?.length ?? 0} clips · ${confidence}% top confidence`;
  els.goblinResearchTrace.innerHTML = (result?.trace ?? []).map((entry) => `<li data-status="${escapeHtml(entry.status)}"><strong>${escapeHtml(entry.stage)}</strong><span>${escapeHtml(entry.detail)}</span></li>`).join("");
}

async function findKeeperClips() {
  const query = els.clipSearch.value.trim();
  if (!query) return;
  els.searchClips.disabled = true;
  els.clipMatchCount.textContent = "Searching";
  try {
    let clips;
    if (els.clipSource.value === "concacaf") {
      try {
        clips = await fetchJson(`/api/youtube/search?q=${encodeURIComponent(query)}`).then((result) => result.clips);
      } catch (serverError) {
        if (!els.youtubeApiKey.value.trim()) throw serverError;
        clips = await searchYouTubeChannelClips({ query, handle: "@concacaf", apiKey: els.youtubeApiKey.value });
      }
    } else {
      clips = await searchYouTubeClips({ query, apiKey: els.youtubeApiKey.value });
    }
    renderClipMatches(clips);
  } catch (error) {
    state.clipMatches = [];
    els.clipResults.innerHTML = `<div class="coverage-warning">${escapeHtml(error.message)} Manual YouTube links remain available in the wizard.</div>`;
    els.clipMatchCount.textContent = "0 matches";
  } finally {
    els.searchClips.disabled = false;
  }
}

function renderClipMatches(clips) {
  state.clipMatches = clips.filter((clip) => validVideoUrl(clip.url));
  els.clipMatchCount.textContent = `${state.clipMatches.length} match${state.clipMatches.length === 1 ? "" : "es"}`;
  els.clipResults.innerHTML = "";
  state.clipMatches.forEach((clip, index) => {
    const button = document.createElement("button");
    button.className = "clip-row";
    button.type = "button";
    const content = document.createElement("span");
    content.className = "clip-row-content";
    if (clip.thumbnail) {
      const image = document.createElement("img");
      image.src = clip.thumbnail;
      image.alt = "";
      image.loading = "lazy";
      content.append(image);
    }
    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = clip.title;
    const meta = document.createElement("small");
    meta.textContent = `${clip.channel ?? "Unknown channel"} · Candidate ${index + 1}`;
    text.append(title, meta);
    content.append(text);
    button.append(content);
    button.addEventListener("click", () => selectClip(clip));
    els.clipResults.append(button);
  });
  if (!state.clipMatches.length) els.clipResults.innerHTML = `<div class="empty-state">No embeddable clips matched this query.</div>`;
}

function selectClip(clip) {
  els.wizardClipUrl.value = clip.url;
  const videoId = clip.videoId ?? youtubeVideoId(clip.url);
  if (videoId) {
    els.clipPreview.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?start=${Math.max(0, Number(els.wizardClipTime.value) || 0)}`;
    els.clipPreview.classList.add("active");
  }
  els.wizardStatus.textContent = "Clip linked; code manually or request a video-in suggestion.";
}

function youtubeVideoId(value) {
  try {
    const url = new URL(value);
    return url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") ?? url.pathname.match(/\/embed\/([^/]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

async function runVideoModel() {
  const gap = selectedKeeperGap();
  if (!gap || !validVideoUrl(els.wizardClipUrl.value)) {
    els.wizardStatus.textContent = "Select an evidence gap and a valid YouTube clip first.";
    return;
  }
  if (!state.videoModelAdapter) {
    els.wizardStatus.textContent = "No video-in adapter registered. Use aviRegisterVideoModelAdapter(adapter) or code manually.";
    return;
  }
  els.runVideoModel.disabled = true;
  els.wizardStatus.textContent = "Video-in model analysing selected timestamp…";
  try {
    const suggestion = await state.videoModelAdapter({
      gap,
      videoUrl: els.wizardClipUrl.value,
      timestampSeconds: Number(els.wizardClipTime.value) || 0,
      outputSchema: { minute: "number|null", situation: "string", shotOrigin: "string", goalZone: "string", confidence: "0..1" }
    });
    applyVideoSuggestion(suggestion, "Video-in model");
  } catch (error) {
    els.wizardStatus.textContent = `Model failed: ${error.message}`;
  } finally {
    els.runVideoModel.disabled = false;
  }
}

function applyVideoSuggestion(suggestion, sourceLabel) {
  const normalized = normalizeVideoSuggestion(suggestion);
  els.wizardMinute.value = normalized.minute ?? els.wizardMinute.value;
  els.wizardSituation.value = normalized.situation;
  setSelectValue(els.wizardOrigin, normalized.shotOrigin);
  setSelectValue(els.wizardGoalZone, normalized.goalZone);
  els.wizardEvidenceState.textContent = "Provisional";
  els.wizardEvidenceState.classList.add("inferred");
  els.wizardStatus.textContent = `${sourceLabel} suggestion · ${Math.round(normalized.confidence * 100)}% confidence · confirmation required.`;
}

function setSelectValue(select, value) {
  if (![...select.options].some((option) => option.value === value)) {
    select.add(new Option(value, value));
  }
  select.value = value;
}

function saveKeeperAction() {
  const gap = selectedKeeperGap();
  const clipUrl = els.wizardClipUrl.value.trim();
  if (!gap || !validEvidenceReference(clipUrl)) {
    els.wizardStatus.textContent = "A selected evidence gap and linked YouTube or local broadcast reference are required.";
    return;
  }
  const shotOrigin = els.wizardOrigin.value || null;
  const goalZone = els.wizardGoalZone.value || null;
  const trajectoryObserved = Boolean(shotOrigin && goalZone);
  ingestGoalkeeperEvents([{
    gapId: gap.id,
    goalkeeper: gap.goalkeeper,
    date: gap.date,
    opponent: gap.opponent,
    minute: Number(els.wizardMinute.value) || gap.minute,
    outcome: els.wizardOutcome.value,
    situation: els.wizardSituation.value,
    shotOrigin,
    goalZone,
    trajectoryObserved,
    clipTimestampSeconds: Number(els.wizardClipTime.value) || 0,
    evidenceQuality: clipUrl.startsWith("local-video:") ? "Analyst-confirmed calibrated broadcast coding" : "Analyst-confirmed clip coding",
    evidenceUrl: clipUrl,
    source: "manual-intelligence-wizard",
    consensus: "validated",
    extrapolatedFrom: state.selectedBroadcastCandidate?.basis ?? null,
    trackingCalibration: state.selectedBroadcastCandidate?.basis?.includes("calibration")
      ? state.broadcastTracker.serialize().pitchCalibration
      : null
  }]);
  els.wizardEvidenceState.textContent = "Validated";
  els.wizardEvidenceState.classList.remove("inferred");
  els.wizardStatus.textContent = "Action written to the local Padagonia goalkeeper ingress array.";
  state.selectedBroadcastCandidate = null;
}

function validEvidenceReference(value) {
  return validVideoUrl(value) || value.startsWith("local-video:");
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload;
}

async function checkEvidenceServer() {
  try {
    const health = await fetchJson("/api/health");
    const groq = health.services.groq ? "Groq ready" : "Groq key missing";
    const youtube = health.services.youtube ? "Concacaf ready" : "YouTube key missing";
    els.serverServiceState.textContent = `${groq} · ${youtube}`;
  } catch {
    els.serverServiceState.textContent = "Static mode · start AVI server";
  }
}

function loadBroadcastFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (state.broadcastObjectUrl) URL.revokeObjectURL(state.broadcastObjectUrl);
  state.broadcastFile = file;
  state.broadcastObjectUrl = URL.createObjectURL(file);
  state.broadcastTracker = new BroadcastTracker();
  state.broadcastCandidates = [];
  state.transcript = null;
  els.broadcastTranscript.value = "";
  els.broadcastVideo.src = state.broadcastObjectUrl;
  els.trackingStatus.textContent = `${file.name} loaded · ${formatFileSize(file.size)}`;
  renderBroadcastCandidates();
  renderTimelineMarkers();
}

function initializeBroadcastTimeline() {
  const duration = Number.isFinite(els.broadcastVideo.duration) ? els.broadcastVideo.duration : 0;
  els.broadcastTimeline.max = String(Math.max(duration, 1));
  els.broadcastTimeline.value = "0";
  resizeTrackingCanvas();
  syncBroadcastTimeline();
}

function syncBroadcastTimeline() {
  const time = els.broadcastVideo.currentTime || 0;
  els.broadcastTimeline.value = String(time);
  els.timelineCurrent.textContent = formatMediaTime(time);
  drawTrackingOverlay();
}

function resizeTrackingCanvas() {
  const bounds = els.broadcastStage.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  els.trackingCanvas.width = Math.max(1, Math.round(bounds.width * scale));
  els.trackingCanvas.height = Math.max(1, Math.round(bounds.height * scale));
  drawTrackingOverlay();
}

function selectBroadcastTool(tool) {
  state.broadcastTool = tool;
  document.querySelectorAll("[data-track-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.trackTool === tool);
  });
  const active = tool !== "cursor";
  els.trackingCanvas.classList.toggle("tracking-active", active);
  if (tool === "ball") els.broadcastTrackId.value = "ball";
  if (tool === "svg-player" && els.broadcastTrackId.value === "ball") els.broadcastTrackId.value = "svg-1";
  if (tool === "opp-player" && ["ball", "svg-1"].includes(els.broadcastTrackId.value)) els.broadcastTrackId.value = "opp-1";
  els.trackingStatus.textContent = tool === "pitch"
    ? `Pitch calibration · ${pitchLandmarks[els.pitchLandmark.value].label}`
    : tool === "goal"
      ? `Goal frame · ${["left post base", "right post base", "right crossbar", "left crossbar"][state.broadcastTracker.goalFrame.length] ?? "left post base"}`
      : tool === "cursor"
        ? "Cursor mode · broadcast controls enabled"
        : `${tool.replace("-", " ")} keyframe · ${formatMediaTime(els.broadcastVideo.currentTime || 0)}`;
}

function addTrackingObservation(event) {
  if (state.broadcastTool === "cursor" || !state.broadcastFile) return;
  const bounds = els.trackingCanvas.getBoundingClientRect();
  const point = {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
  };
  try {
    if (state.broadcastTool === "pitch") {
      const landmarkId = els.pitchLandmark.value;
      const count = state.broadcastTracker.addPitchLandmark(landmarkId, point);
      const nextIndex = (Object.keys(pitchLandmarks).indexOf(landmarkId) + 1) % Object.keys(pitchLandmarks).length;
      els.pitchLandmark.value = Object.keys(pitchLandmarks)[nextIndex];
      els.trackingStatus.textContent = `${count} pitch landmarks · ${count >= 4 ? "homography solved" : `${4 - count} more required`}`;
    } else if (state.broadcastTool === "goal") {
      const count = state.broadcastTracker.addGoalFramePoint(point);
      els.trackingStatus.textContent = count === 4
        ? "Goal frame calibrated"
        : `Goal frame · click ${["left post base", "right post base", "right crossbar", "left crossbar"][count]}`;
    } else {
      const svgPlayer = state.broadcastTool === "svg-player";
      state.broadcastTracker.addKeyframe({
        trackId: els.broadcastTrackId.value.trim() || (state.broadcastTool === "ball" ? "ball" : svgPlayer ? "svg-1" : "opp-1"),
        type: state.broadcastTool === "ball" ? "ball" : "player",
        team: state.broadcastTool === "ball" ? null : svgPlayer ? "svg" : "opponent",
        time: els.broadcastVideo.currentTime || 0,
        ...point
      });
      els.trackingStatus.textContent = `${state.broadcastTool.replace("-", " ")} observation stored at ${formatMediaTime(els.broadcastVideo.currentTime || 0)}`;
    }
  } catch (error) {
    els.trackingStatus.textContent = error.message;
  }
  drawTrackingOverlay();
  renderTimelineMarkers();
}

function drawTrackingOverlay() {
  const canvas = els.trackingCanvas;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  if (!state.broadcastFile) return;
  const point = (item) => ({ x: item.x * width, y: item.y * height });
  context.lineWidth = Math.max(2, width / 480);
  context.font = `700 ${Math.max(12, width / 75)}px system-ui`;

  state.broadcastTracker.pitchCalibration.forEach((item) => {
    const position = point(item.image);
    context.fillStyle = "#35d2a2";
    context.beginPath(); context.arc(position.x, position.y, Math.max(5, width / 150), 0, Math.PI * 2); context.fill();
    context.fillText(pitchLandmarks[item.landmarkId].label, position.x + 9, position.y - 7);
  });
  if (state.broadcastTracker.goalFrame.length) {
    context.strokeStyle = "#e8b547";
    context.beginPath();
    state.broadcastTracker.goalFrame.forEach((item, index) => {
      const position = point(item);
      if (!index) context.moveTo(position.x, position.y); else context.lineTo(position.x, position.y);
    });
    if (state.broadcastTracker.goalFrame.length === 4) context.closePath();
    context.stroke();
  }
  const time = els.broadcastVideo.currentTime || 0;
  for (const [trackId, frames] of state.broadcastTracker.tracks) {
    const current = state.broadcastTracker.trackPointAt(trackId, time);
    if (!current) continue;
    const metadata = frames[0];
    const color = metadata.type === "ball" ? "#ffffff" : metadata.team === "svg" ? "#e8b547" : "#ff6659";
    context.strokeStyle = color;
    context.fillStyle = color;
    context.beginPath();
    frames.forEach((frame, index) => {
      const position = point(frame);
      if (!index) context.moveTo(position.x, position.y); else context.lineTo(position.x, position.y);
    });
    context.stroke();
    const position = point(current);
    context.beginPath(); context.arc(position.x, position.y, metadata.type === "ball" ? Math.max(6, width / 130) : Math.max(10, width / 85), 0, Math.PI * 2); context.fill();
    context.strokeStyle = "#17231f"; context.stroke();
    context.fillText(trackId, position.x + 12, position.y - 10);
  }
}

function renderTimelineMarkers() {
  const duration = Math.max(Number(els.broadcastVideo.duration) || 0, 1);
  const markers = [
    ...state.broadcastTracker.markers.map((marker) => ({ ...marker, kind: "review" })),
    ...state.broadcastTracker.allKeyframes().map((frame, index) => ({ id: `track-${index}`, time: frame.time, label: frame.trackId, kind: "track" })),
    ...state.broadcastCandidates.map((candidate) => ({ id: candidate.id, time: candidate.clipTimeSeconds, label: "Candidate", kind: "inferred" }))
  ];
  els.timelineMarkers.innerHTML = markers.map((marker) => `<button class="timeline-marker ${marker.kind}" type="button" data-marker-time="${marker.time}" style="left:${Math.max(0, Math.min(100, marker.time / duration * 100))}%" title="${escapeHtml(marker.label)} · ${formatMediaTime(marker.time)}" aria-label="${escapeHtml(marker.label)} at ${formatMediaTime(marker.time)}"></button>`).join("");
  els.timelineMarkers.querySelectorAll("[data-marker-time]").forEach((button) => {
    button.addEventListener("click", () => { els.broadcastVideo.currentTime = Number(button.dataset.markerTime); });
  });
}

async function runBroadcastTracking() {
  if (!state.broadcastFile) return;
  if (!state.broadcastTrackingAdapter) {
    els.trackingStatus.textContent = "No tracking adapter registered. Manual calibrated keyframes remain available.";
    return;
  }
  els.runAutoTracking.disabled = true;
  els.trackingStatus.textContent = "Authorised tracker processing broadcast frames…";
  try {
    const result = await state.broadcastTrackingAdapter({
      file: state.broadcastFile,
      duration: els.broadcastVideo.duration,
      calibration: state.broadcastTracker.serialize()
    });
    for (const frame of result.frames ?? []) state.broadcastTracker.addKeyframe(frame);
    els.trackingStatus.textContent = `${result.frames?.length ?? 0} tracking keyframes imported · analyst review required`;
    drawTrackingOverlay();
    renderTimelineMarkers();
  } catch (error) {
    els.trackingStatus.textContent = `Tracking failed: ${error.message}`;
  } finally {
    els.runAutoTracking.disabled = false;
  }
}

function inferTrackedGoals() {
  const candidates = state.broadcastTracker.inferGoalCandidates().map((candidate) => ({ ...candidate, source: "broadcast-geometry" }));
  state.broadcastCandidates = mergeBroadcastCandidates(state.broadcastCandidates, candidates);
  els.trackingStatus.textContent = candidates.length
    ? `${candidates.length} geometric goal candidate${candidates.length === 1 ? "" : "s"} generated for review`
    : "No ball entry into the calibrated goal frame was found.";
  renderBroadcastCandidates();
  renderTimelineMarkers();
}

async function transcribeBroadcast() {
  if (!state.broadcastFile) {
    els.trackingStatus.textContent = "Load an authorised local broadcast file before transcription.";
    return;
  }
  els.transcribeBroadcast.disabled = true;
  els.trackingStatus.textContent = "Server STT transcribing commentary…";
  try {
    const result = await fetchJson("/api/stt", {
      method: "POST",
      headers: { "content-type": state.broadcastFile.type || "video/mp4", "x-file-name": state.broadcastFile.name },
      body: state.broadcastFile
    });
    state.transcript = result;
    els.broadcastTranscript.value = (result.segments?.length
      ? result.segments.map((segment) => `[${formatMediaTime(segment.start)}] ${segment.text.trim()}`).join("\n")
      : result.text) ?? "";
    els.trackingStatus.textContent = `${result.segments?.length ?? 0} timestamped commentary segments received`;
  } catch (error) {
    els.trackingStatus.textContent = `STT failed: ${error.message}`;
  } finally {
    els.transcribeBroadcast.disabled = false;
  }
}

async function inferCommentaryActions() {
  const transcript = els.broadcastTranscript.value.trim();
  if (!transcript) {
    els.trackingStatus.textContent = "A timestamped commentary transcript is required.";
    return;
  }
  els.inferCommentary.disabled = true;
  els.trackingStatus.textContent = "Groq extracting provisional action records…";
  try {
    const gap = selectedKeeperGap();
    const result = await fetchJson("/api/infer-actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript, segments: state.transcript?.segments ?? [], fixture: gap })
    });
    const candidates = result.records.map((record, index) => ({
      ...record,
      id: `commentary-${Date.now()}-${index}`,
      basis: "groq-commentary-extrapolation",
      source: "groq",
      provisional: true
    }));
    state.broadcastCandidates = mergeBroadcastCandidates(state.broadcastCandidates, candidates);
    els.trackingStatus.textContent = `${candidates.length} commentary candidate${candidates.length === 1 ? "" : "s"} generated for review`;
    renderBroadcastCandidates();
    renderTimelineMarkers();
  } catch (error) {
    els.trackingStatus.textContent = `Inference failed: ${error.message}`;
  } finally {
    els.inferCommentary.disabled = false;
  }
}

function mergeBroadcastCandidates(current, additions) {
  const merged = [...current];
  for (const candidate of additions) {
    const match = merged.find((existing) => Math.abs(existing.clipTimeSeconds - candidate.clipTimeSeconds) <= 1.5 && existing.source !== candidate.source);
    if (!match) {
      merged.push(candidate);
      continue;
    }
    const conflictingFields = ["outcome", "situation", "shotOrigin", "goalZone"].filter((field) => {
      const left = match[field];
      const right = candidate[field];
      return left && right && left !== "unknown" && right !== "unknown" && left !== right;
    });
    Object.assign(match, {
      outcome: preferredEvidenceValue(match.outcome, candidate.outcome),
      situation: preferredEvidenceValue(match.situation, candidate.situation),
      shotOrigin: preferredEvidenceValue(match.shotOrigin, candidate.shotOrigin),
      goalZone: preferredEvidenceValue(match.goalZone, candidate.goalZone),
      confidence: Math.min(0.95, 1 - (1 - match.confidence) * (1 - candidate.confidence)),
      basis: `${match.basis}+${candidate.basis}`,
      sources: [...new Set([...(match.sources ?? [match.source]), candidate.source])],
      disputedFields: [...new Set([...(match.disputedFields ?? []), ...conflictingFields])]
    });
  }
  return merged.sort((a, b) => a.clipTimeSeconds - b.clipTimeSeconds);
}

function preferredEvidenceValue(current, incoming) {
  if (current && current !== "unknown") return current;
  return incoming && incoming !== "unknown" ? incoming : current ?? incoming;
}

function renderBroadcastCandidates() {
  els.broadcastCandidateCount.textContent = `${state.broadcastCandidates.length} found`;
  els.broadcastCandidates.innerHTML = state.broadcastCandidates.map((candidate) => `<button class="candidate-row" type="button" data-candidate-id="${candidate.id}"><span><strong>${formatMediaTime(candidate.clipTimeSeconds)} · ${escapeHtml(candidate.outcome)} · ${escapeHtml(candidate.goalZone ?? "direction unknown")}</strong><small>${escapeHtml(candidate.commentaryEvidence ?? candidate.basis)} · ${Math.round(candidate.confidence * 100)}% provisional${candidate.disputedFields?.length ? ` · disputed: ${escapeHtml(candidate.disputedFields.join(", "))}` : ""}</small></span><span class="coverage-tag inferred">${candidate.disputedFields?.length ? "Disputed" : "Review"}</span></button>`).join("") || `<div class="empty-state">No provisional action candidates.</div>`;
  els.broadcastCandidates.querySelectorAll("[data-candidate-id]").forEach((button) => {
    button.addEventListener("click", () => loadBroadcastCandidate(button.dataset.candidateId));
  });
}

function loadBroadcastCandidate(candidateId) {
  const candidate = state.broadcastCandidates.find((item) => item.id === candidateId);
  if (!candidate) return;
  state.selectedBroadcastCandidate = candidate;
  els.broadcastVideo.currentTime = candidate.clipTimeSeconds;
  els.wizardClipTime.value = Math.round(candidate.clipTimeSeconds);
  if (candidate.matchMinute != null) els.wizardMinute.value = candidate.matchMinute;
  if ([...els.wizardSituation.options].some((option) => option.value === candidate.situation)) els.wizardSituation.value = candidate.situation;
  if ([...els.wizardOutcome.options].some((option) => option.value === candidate.outcome)) els.wizardOutcome.value = candidate.outcome;
  setSelectValue(els.wizardOrigin, candidate.shotOrigin ?? "");
  setSelectValue(els.wizardGoalZone, candidate.goalZone ?? "");
  els.wizardClipUrl.value = `local-video:${encodeURIComponent(state.broadcastFile?.name ?? "broadcast")}#t=${Math.round(candidate.clipTimeSeconds)}`;
  els.wizardEvidenceState.textContent = "Provisional";
  els.wizardEvidenceState.classList.add("inferred");
  els.wizardStatus.textContent = `${candidate.basis.replaceAll("-", " ")} · amend fields before confirmation.`;
  els.saveKeeperAction.scrollIntoView({ behavior: "smooth", block: "center" });
}

function formatMediaTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const remainder = Math.floor(value % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatFileSize(bytes) {
  return bytes >= 1024 * 1024 ? `${number(bytes / 1024 / 1024, 1)} MB` : `${number(bytes / 1024, 0)} KB`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
  })[character]);
}

function countBy(items, key) {
  const counts = new Map();
  items.forEach((item) => counts.set(key(item), (counts.get(key(item)) ?? 0) + 1));
  return counts;
}

function nationalityCode(country) {
  return ({
    "Saint Vincent and the Grenadines": "VIN", Grenada: "GRN", "Saint Lucia": "LCA",
    Dominica: "DMA", "Antigua and Barbuda": "ATG", Barbados: "BRB", Guyana: "GUY",
    Jamaica: "JAM", "Trinidad and Tobago": "TRI", Haiti: "HAI", "Curaçao": "CUW", Suriname: "SUR"
  })[country];
}

function opponentTier(country) {
  if (country === "Saint Vincent and the Grenadines") return "Home";
  if (["Grenada", "Saint Lucia", "Dominica", "Antigua and Barbuda", "Barbados", "Guyana"].includes(country)) return "Tier 1";
  return "Tier 2";
}

function hydrateContextPlayers() {
  const entry = state.u20Pools.countries.find((team) => team.country === els.winReqOpponent.value);
  els.contextPlayer.innerHTML = `<option value="">Team aggregate</option>${(entry?.players ?? [])
    .map((player) => `<option value="${player.name}">${positionSymbol(player.position)} ${player.name}</option>`)
    .join("")}`;
}

async function refreshSourceContext({ force = false } = {}) {
  if (!state.contextBroker || state.activeView !== "winreq") return;
  els.refreshContext.disabled = true;
  const scope = {
    domain: els.contextDomain.value,
    competition: els.contextCompetition.value,
    team: els.winReqOpponent.value,
    player: els.contextPlayer.value || null,
    venue: els.winReqVenue.value
  };
  try {
    state.contextResult = await state.contextBroker.contextualize(scope, { force });
    renderSourceContext(state.contextResult);
  } finally {
    els.refreshContext.disabled = false;
  }
}

function renderSourceContext(result) {
  const { consensus, statuses, cache, records } = result;
  const configs = new Map(state.contextBroker.config.sources.map((source) => [source.id, source]));
  const loaded = statuses.filter((status) => ["loaded", "cached"].includes(status.state)).length;
  els.contextConfidence.textContent = percent(consensus.confidence);
  els.validatedPoints.textContent = consensus.validated;
  els.disputedPoints.textContent = consensus.disputed;
  els.cacheState.textContent = cache.state === "fresh" ? "Warm" : cache.state === "revalidated" ? "Updated" : "Miss";
  els.sourceCoverage.textContent = `${loaded} / ${configs.size} active`;
  const wikiSummary = records.find((record) => record.source === "wikipedia" && record.metric === "contextSummary");
  els.opponentContext.textContent = wikiSummary?.value
    ? `${wikiSummary.value.slice(0, 260)}${wikiSummary.value.length > 260 ? "…" : ""}`
    : "No encyclopedia context is cached for this scope; numeric consensus remains available from structured records.";

  els.sourceStatusList.innerHTML = statuses.map((status) => {
    const source = configs.get(status.source);
    const label = status.state.replaceAll("-", " ");
    return `<div class="source-status-row"><span><strong>${source?.label ?? status.source}</strong><small>${source?.policy ?? ""}</small></span><span class="coverage-tag ${status.state === "loaded" ? "" : "inferred"}">${label}</span><strong>${percent(source?.baseTrust ?? 0)}</strong></div>`;
  }).join("");

  const issues = [
    ...consensus.discrepancies.map((issue) => ({ title: `${issue.metric} disputed`, detail: issue.claims.map((claim) => `${claim.source}: ${claim.value}`).join(" · ") })),
    ...statuses.filter((status) => ["failed", "circuit-open"].includes(status.state)).map((status) => ({ title: `${configs.get(status.source)?.label ?? status.source} ingestion failure`, detail: status.error ?? status.state })),
    ...(consensus.provisional ? [{ title: `${consensus.provisional} provisional data points`, detail: "A second independent result source is required for validation." }] : []),
    ...(!consensus.points.length ? [{ title: "No numeric records for this scope", detail: "Load a team or player feed before using the requirement output as evidence." }] : []),
    ...(consensus.points.length && !consensus.disputed && !consensus.provisional ? [{ title: "No variance flags", detail: "All multi-source points fall within their metric tolerances." }] : [])
  ];
  els.contextIssues.innerHTML = issues.slice(0, 5).map((issue) => `<div class="issue-row"><strong>${issue.title}</strong>${issue.detail}</div>`).join("");
}

async function buildPadagoniaContextRecords(scope) {
  if (scope.domain !== "international" || scope.player) return [];
  const profile = buildWinReqProfile(scope.team, els.winReqVenue.value);
  const records = [];
  const addWindow = (window, outcome) => window.forEach((match, matchIndex) => {
    Object.entries(match).forEach(([metric, value]) => records.push({
      source: "padagonia",
      eventId: `model-${scope.team}-${outcome}-${matchIndex + 1}`,
      scope,
      metric,
      metricFamily: ["distance", "sprints", "duels"].includes(metric) ? "physical" : "result",
      value,
      unit: metric.includes("Pct") || metric === "duels" ? "%" : null,
      observedAt: new Date(Date.now() - matchIndex * 86400000).toISOString()
    }));
  });
  addWindow(profile.lossWindow, "loss");
  addWindow(profile.winWindow, "win");
  return records;
}

async function buildHistoricalContextRecords(scope) {
  if (scope.domain !== "international" || scope.player) return [];
  return (state.db.historicalContext ?? [])
    .filter((record) => record.scope.team === scope.team)
    .filter((record) => scope.competition === "All competitions" || record.scope.competition === scope.competition)
    .map((record) => ({
      ...record,
      source: "svg-history",
      originalCompetition: record.scope.competition,
      scope: { ...scope, player: null }
    }));
}

async function readManualSourceRecords(scope, source) {
  try {
    const records = JSON.parse(localStorage.getItem(`avi-manual-source:${source.id}`) ?? "[]");
    return records.filter((record) => record.scope
      && record.scope.domain === scope.domain
      && record.scope.competition === scope.competition
      && record.scope.team === scope.team
      && (record.scope.player ?? null) === (scope.player ?? null));
  } catch {
    throw new Error(`Invalid cached ${source.label} record array`);
  }
}

function ingestSourceRecords(sourceId, records) {
  const source = state.contextBroker.config.sources.find((candidate) => candidate.id === sourceId);
  if (!source || !Array.isArray(records)) throw new Error("Unknown source or invalid record array");
  const normalized = records.map((record) => ({ ...record, source: sourceId }));
  const key = `avi-manual-source:${sourceId}`;
  const existing = JSON.parse(localStorage.getItem(key) ?? "[]");
  localStorage.setItem(key, JSON.stringify([...existing, ...normalized]));
  state.contextBroker.ingest(normalized);
  refreshSourceContext({ force: true });
  return normalized.length;
}

async function fetchWikipediaContext(scope) {
  const title = scope.player || (scope.domain === "international" ? `${scope.team} national football team` : scope.team);
  const params = new URLSearchParams({
    action: "query", prop: "extracts", exintro: "1", explaintext: "1", redirects: "1",
    format: "json", formatversion: "2", origin: "*", titles: title
  });
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`);
  if (!response.ok) throw new Error(`Wikipedia HTTP ${response.status}`);
  const page = (await response.json()).query?.pages?.[0];
  if (!page?.extract) return [];
  return [{
    source: "wikipedia",
    eventId: `context-${scope.team}-${scope.player ?? "team"}`,
    scope,
    metric: "contextSummary",
    metricFamily: "identity",
    value: page.extract,
    evidenceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`
  }];
}

function renderWinReq() {
  if (!state.u20Pools || !els.winReqOpponent.value) return;
  const profile = buildWinReqProfile(els.winReqOpponent.value, els.winReqVenue.value);
  const { losses, wins } = profile;
  const pdi = calculatePdi(profile);
  const flag = state.u20Pools.countries.find((entry) => entry.country === profile.country)?.flag ?? "";

  els.winReqTitle.textContent = `${flag} ${profile.country} win requirement`;
  els.attackLevel.textContent = Math.round(58 + profile.strength * 24 + profile.historyAdjustment.attack);
  els.defenceLevel.textContent = Math.round(61 + profile.strength * 26 + profile.historyAdjustment.defence);
  els.transitionTarget.textContent = `${number(losses.transitionAgainst, 1)}s`;
  els.pdiScore.textContent = Math.round(pdi.score);
  els.pdiCalories.textContent = `~${Math.round(pdi.calories)}`;

  els.winReqTable.innerHTML = winReqMetrics.map(([label, lossKey, winKey, kind, operator, unit]) => {
    const lossValue = losses[lossKey];
    const winValue = wins[winKey];
    const requirement = kind === "attack"
      ? lossValue
      : kind === "defence"
        ? (operator === "<=" ? lossValue : Math.max(lossValue, winValue))
        : Math.max(lossValue, winValue);
    const inferred = kind === "physical";
    return `<tr>
      <td><strong>${label}</strong><small>${kind === "attack" ? "Attacking" : kind === "defence" ? "Defensive" : "Physical"}</small></td>
      <td>${formatRequirementValue(lossValue, unit)}</td>
      <td>${formatRequirementValue(winValue, unit)}</td>
      <td><span class="req-value ${kind === "defence" ? "defensive" : ""}">${operator} ${formatRequirementValue(requirement, unit)}</span></td>
      <td><span class="coverage-tag ${inferred ? "inferred" : ""}">${inferred ? "Inferred" : "Event"}</span></td>
    </tr>`;
  }).join("");

  renderPatterns(els.hotspotList, profile.hotspots);
  renderPatterns(els.assistList, profile.assists);
  els.pdiBreakdown.innerHTML = [
    ["Running load", `${number(pdi.runningCalories, 0)} kcal from ${number(pdi.distancePerPlayer, 1)} km / player`],
    ["Sprint demand", `${number(pdi.sprintCalories, 0)} kcal across ${number(pdi.sprintsPerPlayer, 1)} sprints / player`],
    ["Jostling load", `${number(pdi.jostlingCalories, 0)} kcal at ${number(Number(els.opponentStrength.value), 2)}x strength`],
    ["Pitch and conditions", `${els.pitchLength.value} × ${els.pitchWidth.value} m · ${els.pitchCondition.options[els.pitchCondition.selectedIndex].text}`]
  ].map(([label, detail]) => `<div class="source-row"><div><strong>${label}</strong><small>${detail}</small></div><span class="coverage-tag inferred">Inferred</span></div>`).join("");
  renderHistoricalEvidence(profile.country);
}

function renderHistoricalEvidence(country) {
  const archive = state.db.historicalFixtures ?? [];
  const matchup = archive.filter((fixture) => fixture.opponent === country);
  const displayed = (matchup.length ? matchup : archive).slice(-10).reverse();
  const wins = matchup.filter((fixture) => fixture.result === "W").length;
  const draws = matchup.filter((fixture) => fixture.result === "D").length;
  const losses = matchup.filter((fixture) => fixture.result === "L").length;
  const goalsFor = matchup.reduce((sum, fixture) => sum + fixture.goalsFor, 0);
  const goalsAgainst = matchup.reduce((sum, fixture) => sum + fixture.goalsAgainst, 0);
  const weatherCount = displayed.filter((fixture) => Number.isFinite(fixture.weather?.temperatureMaxC)).length;
  const last = matchup.at(-1);

  els.historyTitle.textContent = matchup.length ? `SVG vs ${country}` : `Recent SVG baseline · no ${country} meeting in archive`;
  els.historyCoverage.textContent = `${archive.length} fixtures · ${state.db.meta.history?.contextRecordCount ?? 0} Padagonia records`;
  els.historyRecord.textContent = `${wins}-${draws}-${losses}`;
  els.historyGoals.textContent = `${goalsFor}:${goalsAgainst}`;
  els.historyLast.textContent = last ? formatFixtureDate(last.date, true) : "—";
  els.historyWeather.textContent = displayed.length ? percent(weatherCount / displayed.length) : "0%";
  els.historyTable.innerHTML = displayed.map((fixture) => {
    const conditions = Number.isFinite(fixture.weather?.temperatureMaxC)
      ? `${number(fixture.weather.temperatureMaxC, 1)}°C · ${number(fixture.weather.precipitationMm ?? 0, 1)} mm rain`
      : "Not available";
    const sources = fixture.sources.map((source) => source.id.replaceAll("-", " ")).join(" + ");
    return `<tr>
      <td><strong>${formatFixtureDate(fixture.date)}</strong></td>
      <td>${fixture.opponent}</td>
      <td>${fixture.venue}<small>${fixture.stadium ?? fixture.location ?? "Venue unverified"}</small></td>
      <td><span class="result-mark ${fixture.result}">${fixture.result}</span><strong>${fixture.goalsFor}-${fixture.goalsAgainst}</strong></td>
      <td>${fixture.competition || "Unspecified"}</td>
      <td>${fixture.restDays ?? "—"}d<small>${fixture.travelKmFromSvg == null ? "Travel unavailable" : `${fixture.travelKmFromSvg.toLocaleString()} km from SVG`}</small></td>
      <td>${conditions}<small>${fixture.weather?.locationBasis?.replaceAll("-", " ") ?? "No conditions source"}</small></td>
      <td><span class="coverage-tag ${fixture.consensus === "validated" ? "" : "inferred"}">${fixture.consensus}</span><small>${sources}</small></td>
    </tr>`;
  }).join("");
}

function formatFixtureDate(date, compact = false) {
  return new Intl.DateTimeFormat("en-GB", { day: compact ? undefined : "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function buildWinReqProfile(country, venue = "Home") {
  const modifiers = {
    Grenada: .91, "Saint Lucia": .92, Dominica: .86, "Antigua and Barbuda": .98,
    Barbados: .94, Guyana: 1.03, Jamaica: 1.28, "Trinidad and Tobago": 1.18,
    Haiti: 1.2, "Curaçao": 1.24, Suriname: 1.22
  };
  const venueFactor = venue === "Away" ? 1.07 : venue === "Home" ? .96 : 1;
  const strength = (modifiers[country] ?? 1) * venueFactor;
  const history = (state.db?.historicalFixtures ?? []).filter((fixture) => fixture.opponent === country);
  const evidence = history.length >= 2 ? history.slice(-6) : (state.db?.historicalFixtures ?? []).slice(-10);
  const historicalGoalsFor = evidence.length ? evidence.reduce((sum, fixture) => sum + fixture.goalsFor, 0) / evidence.length : 1.2;
  const historicalGoalsAgainst = evidence.length ? evidence.reduce((sum, fixture) => sum + fixture.goalsAgainst, 0) / evidence.length : 1.2;
  const historyAdjustment = {
    attack: Math.max(-5, Math.min(8, (1.5 - historicalGoalsFor) * 5)),
    defence: Math.max(-5, Math.min(8, (historicalGoalsAgainst - 1.1) * 4))
  };
  const r = (value, digits = 1) => Number(value.toFixed(digits));
  const lossBaseline = {
    goalsFor: r(.72 * strength), goalsAgainst: r(2.18 / Math.sqrt(strength)),
    shotsFor: r(7.8 * strength), shotsAgainst: r(14.2 / Math.sqrt(strength)),
    cornersFor: r(3.2 * strength), cornersAgainst: r(5.9 / Math.sqrt(strength)),
    cornerShotsFor: r(.55 * strength, 2), cornerShotsAgainst: r(1.45 / Math.sqrt(strength), 2),
    passes: r(355 + 72 * strength, 0), passesAgainst: r(505 - 35 * strength, 0),
    passPct: r(69 + 7 * strength), passPctAgainst: r(82 - 2 * strength),
    passesPerAttackFor: r(11.6 / strength), passesPerAttackAgainst: r(8.5 + .7 / strength),
    transitionFor: r(10.3 / strength), transitionAgainst: r(7.6 + .8 / strength),
    blocks: r(13.8 / strength), tackles: r(17.5 / strength), interceptions: r(10.8 / strength),
    duels: r(44 + 2 * strength), sprints: r(126 + 11 * strength, 0), distance: r(103.2 + 2.2 * strength)
  };
  const winBaseline = {
    goalsFor: r(1.82 * strength), goalsAgainst: r(.68 / Math.sqrt(strength)),
    shotsFor: r(12.8 * strength), shotsAgainst: r(7.4 / Math.sqrt(strength)),
    cornersFor: r(5.1 * strength), cornersAgainst: r(3.1 / Math.sqrt(strength)),
    cornerShotsFor: r(1.18 * strength, 2), cornerShotsAgainst: r(.54 / Math.sqrt(strength), 2),
    passes: r(405 + 85 * strength, 0), passesAgainst: r(395 - 18 * strength, 0),
    passPct: r(73 + 8 * strength), passPctAgainst: r(73 - strength),
    passesPerAttackFor: r(8.9 / strength), passesPerAttackAgainst: r(11.2 / strength),
    transitionFor: r(7.9 / strength), transitionAgainst: r(10.4 / strength),
    blocks: r(8.6 / strength), tackles: r(14.2 + 2 * strength), interceptions: r(9.5 + strength),
    duels: r(50 + 3 * strength), sprints: r(139 + 14 * strength, 0), distance: r(104.8 + 3.1 * strength)
  };
  const lossWindow = buildPerformanceWindow(lossBaseline);
  const winWindow = buildPerformanceWindow(winBaseline);
  return {
    country, strength, historyAdjustment,
    losses: averagePerformanceWindow(lossWindow),
    wins: averagePerformanceWindow(winWindow),
    lossWindow,
    winWindow,
    hotspots: { "Six-yard box": r(22 + 3 / strength, 0), "Central box": r(49 + 4 / strength, 0), "Wide box": r(17 + 2 * strength, 0), "Outside box": r(12 + strength, 0) },
    assists: { Cutback: r(31 + 3 / strength, 0), Cross: r(25 + 2 * strength, 0), "Through ball": r(23 + 2 / strength, 0), "Set piece": r(14 + 3 * strength, 0), "Second ball": r(7 + strength, 0) }
  };
}

function buildPerformanceWindow(baseline) {
  const variance = [-.08, .05, -.03, .09, -.06, .02, .07, -.04, .04, -.06];
  return variance.map((change) => Object.fromEntries(Object.entries(baseline).map(([key, value]) => {
    const sensitivity = key.includes("Pct") || key === "duels" ? .24 : 1;
    return [key, Number((value * (1 + change * sensitivity)).toFixed(2))];
  })));
}

function averagePerformanceWindow(window) {
  return Object.fromEntries(Object.keys(window[0]).map((key) => [
    key,
    Number((window.reduce((sum, match) => sum + match[key], 0) / window.length).toFixed(2))
  ]));
}

function calculatePdi(profile) {
  const playerWeight = Number(els.svgWeight.value) || 74;
  const oppositionWeight = Number(els.opponentWeight.value) || 76;
  const pitchAreaFactor = Math.sqrt(((Number(els.pitchLength.value) || 105) * (Number(els.pitchWidth.value) || 68)) / 7140);
  const conditionFactor = Number(els.pitchCondition.value) || 1;
  const strengthFactor = Number(els.opponentStrength.value) || profile.strength;
  const distancePerPlayer = profile.wins.distance / 10;
  const sprintsPerPlayer = profile.wins.sprints / 10;
  const duelsPerPlayer = profile.wins.duels / 10;
  const runningCalories = playerWeight * distancePerPlayer * .92;
  const sprintCalories = sprintsPerPlayer * .31;
  const jostlingCalories = duelsPerPlayer * (oppositionWeight / playerWeight) * strengthFactor * 1.12;
  const calories = (runningCalories + sprintCalories + jostlingCalories) * pitchAreaFactor * conditionFactor;
  return { calories, runningCalories, sprintCalories, jostlingCalories, distancePerPlayer, sprintsPerPlayer, score: Math.min(100, calories / 9) };
}

function renderPatterns(container, values) {
  const max = Math.max(...Object.values(values));
  container.innerHTML = Object.entries(values).map(([label, value]) => `<div class="pattern-row"><strong>${label}</strong><div class="pattern-track"><div class="pattern-fill" style="width:${value / max * 100}%"></div></div><span>${value}%</span></div>`).join("");
}

function formatRequirementValue(value, unit) {
  return `${number(value, Number.isInteger(value) ? 0 : 1)}${unit}`;
}

function positionSymbol(position) {
  if (position === "GK") return "🧤";
  if (["DF", "CB", "LB", "RB", "LWB", "RWB"].includes(position)) return "🛡";
  if (["MF", "DM", "CM", "AM", "LM", "RM"].includes(position)) return "🎯";
  if (["FW", "LW", "RW", "ST", "SS"].includes(position)) return "⚡";
  return "•";
}

function ageOnDate(dateOfBirth) {
  const [day, month, year] = dateOfBirth.split(".").map(Number);
  const now = new Date();
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1;
  return age;
}

function calculateDirectness(lineup) {
  const observations = lineup.directness;
  const goalmouthToCorner = normaliseSpatialMeasure(observations.goalmouthToCorner);
  const centreToCorner = normaliseSpatialMeasure(observations.centreCircleToCorner);
  return {
    goalmouthToCorner,
    centreToCorner,
    halfField: goalmouthToCorner,
    fullField: (goalmouthToCorner + centreToCorner) / 2
  };
}

function normaliseSpatialMeasure(measure) {
  // Central, goalward routes produce zero; greater corner-flag dispersion approaches +/-2.
  const total = measure.middle + measure.leftCorner + measure.rightCorner;
  if (!total) return 0;
  const dispersion = (measure.leftCorner + measure.rightCorner) / total;
  const direction = measure.rightCorner >= measure.leftCorner ? 1 : -1;
  return Number((direction * dispersion * 2).toFixed(2));
}

function directnessClass(value) {
  const magnitude = Math.abs(value);
  if (magnitude < 0.05) return "Direct through middle";
  if (magnitude < 1) return "Progressive passing";
  return "Possession-oriented";
}

function renderDirectness(lineup) {
  const metrics = calculateDirectness(lineup);
  els.halfFieldScore.textContent = number(metrics.halfField);
  els.fullFieldScore.textContent = number(metrics.fullField);
  els.halfFieldClass.textContent = directnessClass(metrics.halfField);
  els.fullFieldClass.textContent = directnessClass(metrics.fullField);

  const sourceRows = [
    ["Goalmouth to corner flag", metrics.goalmouthToCorner, lineup.directness.goalmouthToCorner],
    ["Centre circle to corner flag", metrics.centreToCorner, lineup.directness.centreCircleToCorner]
  ];
  els.directnessInputs.innerHTML = sourceRows.map(([label, score, source]) => `
    <div class="source-row">
      <div><strong>${label}</strong><small>Middle ${source.middle} · Left ${source.leftCorner} · Right ${source.rightCorner}</small></div>
      <strong>${number(score)}</strong>
    </div>
  `).join("");

  const profiles = state.db.lineups
    .map((candidate) => ({ lineup: candidate, metrics: calculateDirectness(candidate) }))
    .sort((a, b) => Math.abs(a.metrics.fullField) - Math.abs(b.metrics.fullField));
  els.directnessComparison.innerHTML = profiles.map(({ lineup: candidate, metrics: profile }) => `
    <div class="directness-row ${candidate.id === lineup.id ? "selected" : ""}">
      <span><strong>${candidate.label}</strong><small>${directnessClass(profile.fullField)}</small></span>
      <span class="profile-values"><b>${number(profile.halfField)}</b><b>${number(profile.fullField)}</b></span>
    </div>
  `).join("");
}

function getFixture() {
  return state.db.fixtures.find((fixture) => fixture.id === state.fixtureId);
}

function getLineup() {
  return state.optimizedLineup ?? state.db.lineups[0];
}

function refreshOptimizedLineup() {
  const formation = formations.find((candidate) => candidate.id === state.formationId) ?? formations[0];
  state.optimizedLineup = optimizeFormation(formation, getFixture());
  state.lineupId = state.optimizedLineup.id;
  const xavi = calculateLineupModel(state.optimizedLineup, getFixture()).xavi;
  els.lineupSelect.innerHTML = `<option>${formation.label} · ${number(xavi)} XAVI</option>`;
}

function optimizeFormation(formation, fixture) {
  const reference = state.db.lineups.find((lineup) => lineup.id === formation.referenceLineupId) ?? state.db.lineups[0];
  const candidatesBySlot = formation.slots.map((eligiblePositions) => state.db.players
    .filter((player) => eligiblePositions.includes(player.position)));
  const evaluated = new Set();
  let bestLineup = null;
  let bestXavi = -Infinity;

  function assign(slotIndex, selectedIds) {
    if (slotIndex === candidatesBySlot.length) {
      const key = [...selectedIds].sort().join(":");
      if (evaluated.has(key)) return;
      evaluated.add(key);
      const lineup = {
        id: `optimized_${formation.id}`,
        label: `${formation.label} Highest-XAVI XI`,
        formation: formation.id,
        directness: reference.directness,
        players: [...selectedIds]
      };
      const xavi = calculateLineupModel(lineup, fixture).xavi;
      if (xavi > bestXavi) {
        bestXavi = xavi;
        bestLineup = lineup;
      }
      return;
    }

    for (const player of candidatesBySlot[slotIndex]) {
      if (selectedIds.includes(player.id)) continue;
      selectedIds.push(player.id);
      assign(slotIndex + 1, selectedIds);
      selectedIds.pop();
    }
  }

  assign(0, []);
  return bestLineup ?? { ...reference, id: `optimized_${formation.id}`, label: `${formation.label} Highest-XAVI XI` };
}

function playersForLineup(lineup) {
  const playerMap = new Map(state.db.players.map((player) => [player.id, player]));
  return lineup.players.map((id) => playerMap.get(id)).filter(Boolean);
}

function actionWeightMap() {
  return new Map(state.db.actions.map((action) => [action.id, action.weight]));
}

function calculateLineupModel(lineup, fixture) {
  const weights = actionWeightMap();
  const players = playersForLineup(lineup);
  const supplied = {};
  const requiredWeighted = Object.entries(fixture.requiredActions).reduce((sum, [actionId, value]) => {
    return sum + value * (weights.get(actionId) ?? 0);
  }, 0);

  for (const player of players) {
    for (const [actionId, value] of Object.entries(player.actions)) {
      supplied[actionId] = (supplied[actionId] ?? 0) + value;
    }
  }

  const suppliedWeighted = Object.entries(fixture.requiredActions).reduce((sum, [actionId, required]) => {
    const capped = Math.min(supplied[actionId] ?? 0, required);
    return sum + capped * (weights.get(actionId) ?? 0);
  }, 0);

  const annualCost = players.reduce((sum, player) => sum + player.annualCost, 0);
  const contributionByPlayer = players.map((player) => {
    const weightedActions = Object.entries(player.actions).reduce((sum, [actionId, value]) => {
      return sum + value * (weights.get(actionId) ?? 0);
    }, 0);
    const share = requiredWeighted > 0 ? weightedActions / requiredWeighted : 0;
    const aviCost = player.annualCost > 0 ? share / player.annualCost * 1000000 : 0;
    const aviRevenue = player.annualCost > 0 ? share * fixture.revenuePotential / player.annualCost : 0;
    const aer = player.possessionsUsed > 0 ? weightedActions / player.possessionsUsed : 0;
    const costPerWinUnit = weightedActions > 0 ? player.annualCost / weightedActions : 0;
    return { player, weightedActions, share, aviCost, aviRevenue, aer, costPerWinUnit };
  });

  const interactions = state.db.interactions.filter((edge) => {
    return lineup.players.includes(edge.source) && lineup.players.includes(edge.target);
  });
  const interactionValue = interactions.reduce((sum, edge) => sum + edge.value, 0) * state.synergyWeight;
  const maxEdges = players.length * (players.length - 1) / 2;
  const xavi = suppliedWeighted + interactionValue;

  return {
    lineup,
    fixture,
    players,
    supplied,
    requiredWeighted,
    suppliedWeighted,
    coverageRatio: Math.min(suppliedWeighted / requiredWeighted, 1.35),
    annualCost,
    contributionByPlayer,
    interactions,
    interactionValue,
    xavi,
    networkDensity: maxEdges > 0 ? interactions.length / maxEdges : 0
  };
}

function renderBars(model) {
  els.wabBars.innerHTML = state.db.actions
    .filter((action) => model.fixture.requiredActions[action.id] !== undefined)
    .map((action) => {
      const required = model.fixture.requiredActions[action.id];
      const supplied = model.supplied[action.id] ?? 0;
      const ratio = Math.min(supplied / required, 1.4);
      const displayRatio = Math.min(ratio, 1);
      return `
        <div class="bar-item">
          <div class="bar-meta">
            <span>${action.label}</span>
            <strong>${number(supplied, 1)} / ${number(required, 1)}</strong>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${displayRatio * 100}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderRankings(models) {
  els.lineupRankings.innerHTML = models.map((model, index) => `
    <div class="rank-row">
      <span><strong>${index + 1}. ${model.lineup.label}</strong><small>${percent(model.coverageRatio)} WAB coverage</small></span>
      <strong>${number(model.xavi)}</strong>
    </div>
  `).join("");
}

function renderDependency(model) {
  const totals = new Map(model.players.map((player) => [player.id, 0]));
  for (const edge of model.interactions) {
    totals.set(edge.source, (totals.get(edge.source) ?? 0) + edge.value);
    totals.set(edge.target, (totals.get(edge.target) ?? 0) + edge.value);
  }
  const totalInteraction = [...totals.values()].reduce((sum, value) => sum + value, 0) || 1;
  const rows = [...totals.entries()]
    .map(([id, value]) => ({
      player: model.players.find((item) => item.id === id),
      value,
      dependency: value / totalInteraction
    }))
    .sort((a, b) => b.dependency - a.dependency)
    .slice(0, 5);

  els.dependencyList.innerHTML = rows.map((row) => `
    <div class="rank-row">
      <span><strong>${row.player.name}</strong><small>${row.player.position} network reliance</small></span>
      <strong>${percent(row.dependency)}</strong>
    </div>
  `).join("");
}

function renderReplacement(model, fixture) {
  const rows = model.players.map((player) => {
    const reducedLineup = {
      ...model.lineup,
      players: model.lineup.players.filter((id) => id !== player.id)
    };
    const reduced = calculateLineupModel(reducedLineup, fixture);
    return {
      player,
      loss: model.xavi - reduced.xavi,
      retained: reduced.xavi / model.xavi
    };
  }).sort((a, b) => b.loss - a.loss).slice(0, 5);

  els.replacementList.innerHTML = rows.map((row) => `
    <div class="rank-row">
      <span><strong>${row.player.name}</strong><small>${percent(row.retained)} XAVI retained</small></span>
      <strong>-${number(row.loss)}</strong>
    </div>
  `).join("");
}

function renderPlayers(model) {
  const rows = model.contributionByPlayer
    .sort((a, b) => {
      const left = state.mode === "cost" ? a.aviCost : a.aviRevenue;
      const right = state.mode === "cost" ? b.aviCost : b.aviRevenue;
      return right - left;
    });

  els.playerTable.innerHTML = rows.map((row) => {
    const avi = state.mode === "cost" ? row.aviCost : row.aviRevenue;
    return `
      <tr>
        <td><strong>${row.player.name}</strong></td>
        <td><span class="position">${positionSymbol(row.player.position)} ${row.player.position}</span></td>
        <td>${percent(row.share, 1)}</td>
        <td>${number(avi, 3)}</td>
        <td>${number(row.aer, 3)}</td>
        <td>${formatFullMoney.format(row.costPerWinUnit)}</td>
      </tr>
    `;
  }).join("");
}

function renderNetwork(model) {
  const canvas = els.networkCanvas;
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(760, Math.floor(rect.width * scale));
  canvas.height = Math.floor(canvas.width / 1.65);
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const positions = layoutPlayers(model, width, height);
  ctx.lineCap = "round";

  const cavConnections = calculateCavConnections(model);
  const maxCav = Math.max(...cavConnections.map((edge) => edge.value), 0.01);

  for (const edge of cavConnections) {
    const a = positions.get(edge.source);
    const b = positions.get(edge.target);
    const strength = edge.value / maxCav;
    ctx.strokeStyle = `rgba(15, 139, 141, ${0.12 + strength * 0.68})`;
    ctx.lineWidth = (1 + strength * 7) * scale;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const player of model.players) {
    const point = positions.get(player.id);
    const contribution = model.contributionByPlayer.find((row) => row.player.id === player.id);
    const radius = (18 + Math.min(contribution.share, 0.2) * 80) * scale;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#c44536";
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#171b22";
    ctx.font = `${12 * scale}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(player.position, point.x, point.y - 3 * scale);
    ctx.fillStyle = "#637083";
    ctx.font = `${10 * scale}px Inter, sans-serif`;
    ctx.fillText(player.name.split(" ").at(-1), point.x, point.y + 12 * scale);
  }
}

function calculateCavConnections(model) {
  const recorded = new Map(model.interactions.map((edge) => [
    [edge.source, edge.target].sort().join(":"), edge.value
  ]));
  const actionIds = state.db.actions.map((action) => action.id);
  const connections = [];

  for (let index = 0; index < model.players.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < model.players.length; otherIndex += 1) {
      const source = model.players[index];
      const target = model.players[otherIndex];
      const key = [source.id, target.id].sort().join(":");
      const observed = recorded.get(key) ?? 0;
      const sourceValue = weightedActionValue(source, actionIds);
      const targetValue = weightedActionValue(target, actionIds);
      const roleComplement = positionalComplement(source.position, target.position);
      // Every positional pair has a CAV edge: observed chain value plus complementary action capacity.
      const generated = Math.sqrt(sourceValue * targetValue) * roleComplement * 0.16;
      connections.push({ source: source.id, target: target.id, value: observed + generated });
    }
  }
  return connections;
}

function weightedActionValue(player, actionIds) {
  const weights = actionWeightMap();
  return actionIds.reduce((sum, actionId) => sum + (player.actions[actionId] ?? 0) * (weights.get(actionId) ?? 0), 0);
}

function positionalComplement(source, target) {
  const pair = new Set([source, target]);
  if (pair.has("GK")) return 0.55;
  if (pair.has("ST") && (pair.has("AM") || pair.has("LW") || pair.has("RW"))) return 1.3;
  if ((pair.has("LB") || pair.has("RB")) && (pair.has("LW") || pair.has("RW"))) return 1.22;
  if (pair.has("DM") && (pair.has("CM") || pair.has("AM"))) return 1.18;
  if (pair.has("CB") && (pair.has("DM") || pair.has("LB") || pair.has("RB"))) return 1.08;
  return 0.88;
}

function layoutPlayers(model, width, height) {
  const players = model.players;
  const formation = formations.find((candidate) => candidate.id === model.lineup.formation);
  if (formation && model.lineup.players.length === formation.slots.length) {
    const positions = new Map();
    let playerIndex = 0;
    formation.rows.forEach((row, rowIndex) => {
      const y = formation.rows.length === 1 ? .5 : .88 - rowIndex * (.74 / (formation.rows.length - 1));
      row.forEach((role, roleIndex) => {
        const x = row.length === 1 ? .5 : .14 + roleIndex * (.72 / (row.length - 1));
        positions.set(model.lineup.players[playerIndex], { x: width * x, y: height * y, role });
        playerIndex += 1;
      });
    });
    return positions;
  }

  const byPosition = new Map();
  for (const player of players) {
    const row = player.position === "GK" ? 0
      : player.position === "CB" ? 1
        : ["LB", "DM", "RB"].includes(player.position) ? 2
          : ["CM", "AM"].includes(player.position) ? 3 : 4;
    byPosition.set(player.id, row);
  }
  const rows = [0, 1, 2, 3, 4].map((row) => players
    .filter((player) => byPosition.get(player.id) === row)
    .sort((a, b) => a.position.localeCompare(b.position) || a.name.localeCompare(b.name))
    .map((player) => player.id))
    .filter((row) => row.length);
  const positions = new Map();
  const top = height * 0.12;
  const rowGap = (height * 0.76) / Math.max(rows.length - 1, 1);

  rows.forEach((row, rowIndex) => {
    const y = top + rowGap * rowIndex;
    const xGap = width * 0.72 / Math.max(row.length - 1, 1);
    const start = width * 0.14;
    row.forEach((id, index) => {
      const x = row.length === 1 ? width / 2 : start + xGap * index;
      positions.set(id, { x, y });
    });
  });

  let fallbackIndex = 0;
  for (const player of players) {
    if (!positions.has(player.id)) {
      positions.set(player.id, {
        x: width * (0.25 + (fallbackIndex % 3) * 0.25),
        y: height * 0.5
      });
      fallbackIndex += 1;
    }
  }
  return positions;
}

window.addEventListener("resize", () => {
  if (state.db) renderNetwork(calculateLineupModel(getLineup(), getFixture()));
  if (state.activeView === "keepers") resizeTrackingCanvas();
});
