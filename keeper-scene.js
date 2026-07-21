import * as THREE from "./vendor/three.module.min.js";

const PITCH_WIDTH = 68;
const FINAL_THIRD_DEPTH = 36;
const GOAL_WIDTH = 7.32;
const GOAL_HEIGHT = 2.44;

function normalizedLabel(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function trajectoryCoordinates(event) {
  const origin = normalizedLabel(event?.shotOrigin);
  const zone = normalizedLabel(event?.goalZone);
  if (!origin || !zone) return null;

  let originX = 0;
  if (origin.includes("left")) originX = -8.5;
  if (origin.includes("right")) originX = 8.5;

  let originZ = 27;
  if (origin.includes("six")) originZ = 5.5;
  else if (origin.includes("penalty")) originZ = 11;
  else if (origin.includes("box")) originZ = 16.5;
  else if (origin.includes("circle")) originZ = FINAL_THIRD_DEPTH;

  const targetX = zone.includes("right")
    ? GOAL_WIDTH * 0.36
    : zone.includes("left")
      ? -GOAL_WIDTH * 0.36
      : 0;
  const targetY = zone.includes("high")
    ? GOAL_HEIGHT * 0.78
    : zone.includes("low")
      ? 0.32
      : GOAL_HEIGHT * 0.48;

  return {
    origin: [originX, 0.18, originZ],
    target: [targetX, targetY, 0.08]
  };
}

function addLine(scene, points, material) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  return line;
}

function pitchLine(x, z, width, depth, material) {
  const geometry = new THREE.BoxGeometry(width, 0.025, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, 0.026, z);
  return mesh;
}

function createPitch() {
  const group = new THREE.Group();
  const turf = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH_WIDTH, FINAL_THIRD_DEPTH + 4),
    new THREE.MeshStandardMaterial({ color: 0x2f7651, roughness: 0.94 })
  );
  turf.rotation.x = -Math.PI / 2;
  turf.position.z = FINAL_THIRD_DEPTH / 2 - 1;
  turf.receiveShadow = true;
  group.add(turf);

  const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0x347d57, roughness: 1 });
  for (let index = 0; index < 8; index += 1) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_WIDTH / 8, FINAL_THIRD_DEPTH + 4), stripeMaterial);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(-PITCH_WIDTH / 2 + PITCH_WIDTH / 16 + index * PITCH_WIDTH / 8, 0.008, FINAL_THIRD_DEPTH / 2 - 1);
    if (index % 2 === 0) group.add(stripe);
  }

  const white = new THREE.MeshBasicMaterial({ color: 0xf4f7f5 });
  group.add(
    pitchLine(0, 0, PITCH_WIDTH, 0.11, white),
    pitchLine(-PITCH_WIDTH / 2, FINAL_THIRD_DEPTH / 2 - 1, 0.11, FINAL_THIRD_DEPTH + 4, white),
    pitchLine(PITCH_WIDTH / 2, FINAL_THIRD_DEPTH / 2 - 1, 0.11, FINAL_THIRD_DEPTH + 4, white),
    pitchLine(0, FINAL_THIRD_DEPTH, PITCH_WIDTH, 0.11, white),
    pitchLine(-20.16, 8.25, 0.11, 16.5, white),
    pitchLine(20.16, 8.25, 0.11, 16.5, white),
    pitchLine(0, 16.5, 40.32, 0.11, white),
    pitchLine(-9.16, 2.75, 0.11, 5.5, white),
    pitchLine(9.16, 2.75, 0.11, 5.5, white),
    pitchLine(0, 5.5, 18.32, 0.11, white)
  );

  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), white);
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 0.04, 11);
  group.add(spot);

  const arcPoints = [];
  for (let i = 0; i <= 36; i += 1) {
    const angle = THREE.MathUtils.degToRad(37 + (106 * i) / 36);
    arcPoints.push(new THREE.Vector3(Math.cos(angle) * 9.15, 0.045, 11 + Math.sin(angle) * 9.15));
  }
  addLine(group, arcPoints, new THREE.LineBasicMaterial({ color: 0xf4f7f5 }));
  return group;
}

function createGoal() {
  const group = new THREE.Group();
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.05, roughness: 0.45 });
  const postGeometry = new THREE.CylinderGeometry(0.075, 0.075, GOAL_HEIGHT, 12);
  for (const x of [-GOAL_WIDTH / 2, GOAL_WIDTH / 2]) {
    const post = new THREE.Mesh(postGeometry, frameMaterial);
    post.position.set(x, GOAL_HEIGHT / 2, 0);
    group.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, GOAL_WIDTH, 12), frameMaterial);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, GOAL_HEIGHT, 0);
  group.add(bar);

  const netMaterial = new THREE.LineBasicMaterial({ color: 0xc7d4ce, transparent: true, opacity: 0.5 });
  for (let x = -GOAL_WIDTH / 2; x <= GOAL_WIDTH / 2 + 0.01; x += GOAL_WIDTH / 8) {
    addLine(group, [new THREE.Vector3(x, 0, -1.7), new THREE.Vector3(x, GOAL_HEIGHT, -1.7), new THREE.Vector3(x, GOAL_HEIGHT, 0)], netMaterial);
  }
  for (let y = 0; y <= GOAL_HEIGHT + 0.01; y += GOAL_HEIGHT / 5) {
    addLine(group, [new THREE.Vector3(-GOAL_WIDTH / 2, y, -1.7), new THREE.Vector3(GOAL_WIDTH / 2, y, -1.7)], netMaterial);
  }
  addLine(group, [new THREE.Vector3(-GOAL_WIDTH / 2, 0, 0), new THREE.Vector3(-GOAL_WIDTH / 2, 0, -1.7), new THREE.Vector3(GOAL_WIDTH / 2, 0, -1.7), new THREE.Vector3(GOAL_WIDTH / 2, 0, 0)], netMaterial);
  return group;
}

function createKeeper() {
  const group = new THREE.Group();
  const kit = new THREE.MeshStandardMaterial({ color: 0xe8b547, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17231f, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8f5d43, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.65, 5, 10), kit);
  torso.position.y = 1.2;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin);
  head.position.y = 1.95;
  group.add(head);
  for (const x of [-0.24, 0.24]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.62, 4, 8), dark);
    leg.position.set(x, 0.48, 0);
    leg.rotation.z = x < 0 ? -0.12 : 0.12;
    group.add(leg);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.62, 4, 8), kit);
    arm.position.set(x * 2.1, 1.3, 0);
    arm.rotation.z = x < 0 ? -0.75 : 0.75;
    group.add(arm);
  }
  group.position.set(0, 0.02, 1.1);
  return group;
}

function disposeGroup(group) {
  group.traverse((object) => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  });
}

export class KeeperFinalThirdScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8eeeb);
    this.scene.fog = new THREE.Fog(0xe8eeeb, 57, 90);
    this.camera = new THREE.PerspectiveCamera(37, 1, 0.1, 160);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.trajectoryGroup = new THREE.Group();
    this.scene.add(createPitch(), createGoal(), createKeeper(), this.trajectoryGroup);
    this.scene.add(new THREE.HemisphereLight(0xf5f8f6, 0x183d2b, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-18, 32, 28);
    sun.castShadow = true;
    this.scene.add(sun);
    this.azimuth = 0.66;
    this.elevation = 0.62;
    this.distance = 46;
    this.target = new THREE.Vector3(0, 1.2, 13);
    this.paths = [];
    this.balls = [];
    this.elapsed = 0;
    this.paused = false;
    this.drag = null;
    this.lastTime = performance.now();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.bindInteraction();
    this.resetCamera();
    this.resize();
    this.frame = this.frame.bind(this);
    this.animationId = requestAnimationFrame(this.frame);
  }

  bindInteraction() {
    this.canvas.addEventListener("pointerdown", (event) => {
      this.drag = { x: event.clientX, y: event.clientY, azimuth: this.azimuth, elevation: this.elevation };
      try { this.canvas.setPointerCapture(event.pointerId); } catch { /* Synthetic and assistive events may not own a pointer. */ }
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.drag) return;
      this.azimuth = THREE.MathUtils.clamp(this.drag.azimuth - (event.clientX - this.drag.x) * 0.006, -0.9, 0.9);
      this.elevation = THREE.MathUtils.clamp(this.drag.elevation + (event.clientY - this.drag.y) * 0.004, 0.22, 0.82);
      this.updateCamera();
      this.canvas.dataset.cameraRevision = String(Number(this.canvas.dataset.cameraRevision ?? 0) + 1);
    });
    this.canvas.addEventListener("pointerup", () => { this.drag = null; });
    this.canvas.addEventListener("pointercancel", () => { this.drag = null; });
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.distance = THREE.MathUtils.clamp(this.distance + event.deltaY * 0.025, 36, 72);
      this.updateCamera();
      this.canvas.dataset.cameraRevision = String(Number(this.canvas.dataset.cameraRevision ?? 0) + 1);
    }, { passive: false });
  }

  updateCamera() {
    const planar = Math.cos(this.elevation) * this.distance;
    this.camera.position.set(
      Math.sin(this.azimuth) * planar,
      Math.sin(this.elevation) * this.distance,
      this.target.z + Math.cos(this.azimuth) * planar
    );
    this.camera.lookAt(this.target);
  }

  resetCamera() {
    this.azimuth = 0.66;
    this.elevation = 0.62;
    this.distance = 46;
    this.updateCamera();
    this.canvas.dataset.cameraRevision = String(Number(this.canvas.dataset.cameraRevision ?? 0) + 1);
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    return this.paused;
  }

  setEvents(events) {
    disposeGroup(this.trajectoryGroup);
    this.trajectoryGroup.clear();
    this.paths = [];
    this.balls = [];
    events.forEach((event, index) => {
      const coordinates = trajectoryCoordinates(event);
      if (!coordinates) return;
      const start = new THREE.Vector3(...coordinates.origin);
      const end = new THREE.Vector3(...coordinates.target);
      const mid = start.clone().lerp(end, 0.55);
      mid.y = Math.max(start.y, end.y) + 1.1 + Math.min(start.distanceTo(end) * 0.035, 1.1);
      const curve = new THREE.CatmullRomCurve3([start, mid, end]);
      const penalty = event.situation === "penalty";
      const color = penalty ? 0xc8493d : 0x35d2a2;
      const path = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 36, 0.065, 8, false),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })
      );
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.58 })
      );
      ball.castShadow = true;
      ball.position.copy(start);
      this.trajectoryGroup.add(path, ball);
      this.paths.push(curve);
      this.balls.push({ mesh: ball, path: curve, offset: index / Math.max(events.length, 1) });
    });
    this.canvas.dataset.trajectoryCount = String(this.paths.length);
  }

  resize() {
    const width = Math.max(1, Math.round(this.canvas.clientWidth || this.canvas.width));
    const height = Math.max(1, Math.round(this.canvas.clientHeight || this.canvas.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  frame(time) {
    const frameTime = Number.isFinite(time) ? time : performance.now();
    const delta = Math.max(0, Math.min((frameTime - this.lastTime) / 1000, 0.1));
    this.lastTime = frameTime;
    if (!this.paused) this.elapsed += delta;
    this.balls.forEach((ball) => {
      const progress = Number.isFinite(this.elapsed) ? (this.elapsed * 0.32 + ball.offset) % 1 : 0;
      ball.mesh.position.copy(ball.path.getPoint(progress));
      ball.mesh.rotation.x += delta * 7;
      ball.mesh.rotation.z += delta * 4;
    });
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.sceneReady = "true";
    this.animationId = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.animationId);
    this.resizeObserver.disconnect();
    disposeGroup(this.scene);
    this.renderer.dispose();
  }
}
