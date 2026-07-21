import assert from "node:assert/strict";
import { BroadcastTracker, computeHomography, projectPoint } from "./tracking-engine.js";

const calibration = [
  { image: { x: 0, y: 0 }, pitch: { x: -20, y: 0 } },
  { image: { x: 1, y: 0 }, pitch: { x: 20, y: 0 } },
  { image: { x: 0, y: 1 }, pitch: { x: -20, y: 16 } },
  { image: { x: 1, y: 1 }, pitch: { x: 20, y: 16 } }
];
const homography = computeHomography(calibration);
const centre = projectPoint(homography, { x: 0.5, y: 0.5 });
assert.ok(Math.abs(centre.x) < 1e-7);
assert.ok(Math.abs(centre.y - 8) < 1e-7);

const tracker = new BroadcastTracker();
tracker.addPitchLandmark("penalty-left-goal", { x: 0, y: 0 });
tracker.addPitchLandmark("penalty-right-goal", { x: 1, y: 0 });
tracker.addPitchLandmark("penalty-left-front", { x: 0, y: 1 });
tracker.addPitchLandmark("penalty-right-front", { x: 1, y: 1 });
assert.ok(tracker.homography);

tracker.addGoalFramePoint({ x: 0.4, y: 0.35 });
tracker.addGoalFramePoint({ x: 0.6, y: 0.35 });
tracker.addGoalFramePoint({ x: 0.6, y: 0.15 });
tracker.addGoalFramePoint({ x: 0.4, y: 0.15 });
tracker.addKeyframe({ trackId: "ball", type: "ball", time: 10, x: 0.5, y: 0.5 });
tracker.addKeyframe({ trackId: "ball", type: "ball", time: 10.4, x: 0.55, y: 0.3 });
const candidates = tracker.inferGoalCandidates();
assert.equal(candidates.length, 1);
assert.equal(candidates[0].goalZone, "Low right");
assert.equal(candidates[0].basis, "goal-frame-and-pitch-calibration");
assert.equal(candidates[0].provisional, true);

tracker.addKeyframe({ trackId: "svg-9", type: "player", team: "svg", time: 10, x: 0.2, y: 0.7 });
tracker.addKeyframe({ trackId: "svg-9", type: "player", team: "svg", time: 12, x: 0.4, y: 0.5 });
assert.deepEqual(tracker.trackPointAt("svg-9", 11), { x: 0.30000000000000004, y: 0.6 });
assert.equal(tracker.serialize().tracks.length, 2);

console.log("Broadcast tracking geometry tests passed");
