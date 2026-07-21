const EPSILON = 1e-8;

export const pitchLandmarks = {
  "goal-left": { label: "Goal line · left post", pitch: { x: -3.66, y: 0 } },
  "goal-right": { label: "Goal line · right post", pitch: { x: 3.66, y: 0 } },
  "six-left-front": { label: "Six-yard box · left front", pitch: { x: -9.16, y: 5.5 } },
  "six-right-front": { label: "Six-yard box · right front", pitch: { x: 9.16, y: 5.5 } },
  "penalty-left-goal": { label: "Penalty area · left goal line", pitch: { x: -20.16, y: 0 } },
  "penalty-right-goal": { label: "Penalty area · right goal line", pitch: { x: 20.16, y: 0 } },
  "penalty-left-front": { label: "Penalty area · left front", pitch: { x: -20.16, y: 16.5 } },
  "penalty-right-front": { label: "Penalty area · right front", pitch: { x: 20.16, y: 16.5 } },
  "penalty-spot": { label: "Penalty spot", pitch: { x: 0, y: 11 } }
};

function solveLinear(matrix, values) {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < EPSILON) throw new Error("Calibration points do not define a stable pitch plane");
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map((row) => row[size]);
}

export function computeHomography(correspondences) {
  if (!Array.isArray(correspondences) || correspondences.length < 4) {
    throw new Error("At least four pitch landmark correspondences are required");
  }
  const points = correspondences.slice(-4);
  const matrix = [];
  const values = [];
  for (const { image, pitch } of points) {
    const { x, y } = image;
    matrix.push([x, y, 1, 0, 0, 0, -pitch.x * x, -pitch.x * y]);
    values.push(pitch.x);
    matrix.push([0, 0, 0, x, y, 1, -pitch.y * x, -pitch.y * y]);
    values.push(pitch.y);
  }
  const coefficients = solveLinear(matrix, values);
  return [coefficients[0], coefficients[1], coefficients[2], coefficients[3], coefficients[4], coefficients[5], coefficients[6], coefficients[7], 1];
}

export function projectPoint(homography, point) {
  if (!homography) return null;
  const denominator = homography[6] * point.x + homography[7] * point.y + homography[8];
  if (Math.abs(denominator) < EPSILON) return null;
  return {
    x: (homography[0] * point.x + homography[1] * point.y + homography[2]) / denominator,
    y: (homography[3] * point.x + homography[4] * point.y + homography[5]) / denominator
  };
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current];
    const b = polygon[previous];
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function interpolatePoint(before, after, time) {
  if (!before) return after ? { x: after.x, y: after.y } : null;
  if (!after || before.time === after.time) return { x: before.x, y: before.y };
  const ratio = (time - before.time) / (after.time - before.time);
  return { x: before.x + (after.x - before.x) * ratio, y: before.y + (after.y - before.y) * ratio };
}

export class BroadcastTracker {
  constructor() {
    this.pitchCalibration = [];
    this.goalFrame = [];
    this.tracks = new Map();
    this.markers = [];
  }

  addPitchLandmark(landmarkId, image) {
    const landmark = pitchLandmarks[landmarkId];
    if (!landmark) throw new Error(`Unknown pitch landmark: ${landmarkId}`);
    this.pitchCalibration = this.pitchCalibration.filter((item) => item.landmarkId !== landmarkId);
    this.pitchCalibration.push({ landmarkId, image, pitch: landmark.pitch });
    return this.pitchCalibration.length;
  }

  get homography() {
    if (this.pitchCalibration.length < 4) return null;
    return computeHomography(this.pitchCalibration);
  }

  addGoalFramePoint(point) {
    if (this.goalFrame.length >= 4) this.goalFrame = [];
    this.goalFrame.push(point);
    return this.goalFrame.length;
  }

  addKeyframe({ trackId, type, team = null, time, x, y }) {
    if (!trackId || !["ball", "player"].includes(type)) throw new Error("A ball or player track identifier is required");
    const frames = this.tracks.get(trackId) ?? [];
    const frame = { trackId, type, team, time: Number(time), x, y };
    const withoutSameTime = frames.filter((item) => Math.abs(item.time - frame.time) > 0.02);
    withoutSameTime.push(frame);
    withoutSameTime.sort((a, b) => a.time - b.time);
    this.tracks.set(trackId, withoutSameTime);
    return frame;
  }

  addMarker(time, label = "Review") {
    const marker = { id: `marker-${Date.now()}-${this.markers.length}`, time: Number(time), label };
    this.markers.push(marker);
    this.markers.sort((a, b) => a.time - b.time);
    return marker;
  }

  undoLast() {
    let latest = null;
    for (const [trackId, frames] of this.tracks) {
      const candidate = frames.at(-1);
      if (candidate && (!latest || candidate.time >= latest.frame.time)) latest = { trackId, frame: candidate };
    }
    if (!latest) return null;
    const frames = this.tracks.get(latest.trackId);
    frames.pop();
    if (!frames.length) this.tracks.delete(latest.trackId);
    return latest.frame;
  }

  trackPointAt(trackId, time) {
    const frames = this.tracks.get(trackId) ?? [];
    if (!frames.length) return null;
    const before = [...frames].reverse().find((frame) => frame.time <= time);
    const after = frames.find((frame) => frame.time >= time);
    return interpolatePoint(before, after, time);
  }

  allKeyframes() {
    return [...this.tracks.values()].flat().sort((a, b) => a.time - b.time);
  }

  inferGoalCandidates() {
    if (this.goalFrame.length !== 4) return [];
    const ballFrames = [...this.tracks.entries()]
      .filter(([, frames]) => frames[0]?.type === "ball")
      .flatMap(([, frames]) => frames)
      .sort((a, b) => a.time - b.time);
    const candidates = [];
    let previouslyInside = false;
    for (const frame of ballFrames) {
      const inside = pointInPolygon(frame, this.goalFrame);
      if (inside && !previouslyInside) {
        const xs = this.goalFrame.map((point) => point.x);
        const ys = this.goalFrame.map((point) => point.y);
        const left = Math.min(...xs);
        const right = Math.max(...xs);
        const top = Math.min(...ys);
        const bottom = Math.max(...ys);
        const horizontal = (frame.x - left) / Math.max(right - left, EPSILON);
        const vertical = (frame.y - top) / Math.max(bottom - top, EPSILON);
        const lateral = horizontal < 0.34 ? "left" : horizontal > 0.66 ? "right" : "centre";
        const height = vertical < 0.34 ? "High" : vertical > 0.66 ? "Low" : "Mid";
        const pitchPoint = projectPoint(this.homography, frame);
        candidates.push({
          id: `tracking-${frame.trackId}-${frame.time.toFixed(2)}`,
          clipTimeSeconds: frame.time,
          outcome: "conceded",
          situation: "open-play",
          shotOrigin: null,
          goalZone: `${height} ${lateral}`,
          confidence: this.homography ? 0.78 : 0.62,
          basis: this.homography ? "goal-frame-and-pitch-calibration" : "goal-frame-only",
          pitchPoint,
          provisional: true
        });
      }
      previouslyInside = inside;
    }
    return candidates;
  }

  serialize() {
    return {
      pitchCalibration: this.pitchCalibration,
      goalFrame: this.goalFrame,
      tracks: [...this.tracks.entries()],
      markers: this.markers
    };
  }
}
