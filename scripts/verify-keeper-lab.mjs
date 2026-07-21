import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = process.env.PLAYWRIGHT_CDP
  ? await chromium.connectOverCDP(process.env.PLAYWRIGHT_CDP)
  : await chromium.launch({
      executablePath: "/usr/bin/google-chrome",
      headless: true,
      args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"]
    });
const baseUrl = process.env.AVI_BASE_URL ?? "http://127.0.0.1:8081";

async function verifyViewport(name, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  const response = await page.goto(`${baseUrl}/#keepers`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, `${name}: application returned ${response?.status()}`);
  await page.waitForSelector('[data-view="keepers"]', { state: "attached" });
  await page.waitForFunction(() => document.querySelector("#dbName")?.textContent === "AVI model", null, { timeout: 10000 });
  await page.locator('[data-view-target="path"]').click();
  await page.waitForFunction(() => document.querySelectorAll("#pathWorldMap .path-map-route").length > 0);
  assert.equal(await page.locator("#pathMapLegend .path-map-category").count(), 2, `${name}: category route legend is incomplete`);
  assert.match(await page.locator("#pathMapScope").textContent(), /origin airport/i);
  assert.notEqual(await page.locator("#pathWorldMap").getAttribute("viewBox"), "0 0 1000 500", `${name}: map did not fit to player-pool scope`);
  await page.locator('[data-view-target="keepers"]').click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-view="keepers"]').getAttribute("class"), "view active", `${name}: Keeper Lab did not activate: ${errors.join(" | ")}`);
  await page.waitForTimeout(1000);
  assert.equal(await page.locator("#keeperCanvas").getAttribute("data-scene-ready"), "true", `${name}: Three.js scene did not render: ${errors.join(" | ")}`);
  await page.waitForTimeout(350);

  const canvas = page.locator("#keeperCanvas");
  const firstFrame = await canvas.evaluate((element) => element.toDataURL());
  await page.waitForTimeout(450);
  const secondFrame = await canvas.evaluate((element) => element.toDataURL());
  assert.notEqual(firstFrame, secondFrame, `${name}: animated trajectory frame did not change`);

  const pixels = await canvas.evaluate((element) => {
    const sample = document.createElement("canvas");
    sample.width = 160;
    sample.height = 100;
    const context = sample.getContext("2d", { willReadFrequently: true });
    context.drawImage(element, 0, 0, sample.width, sample.height);
    const data = context.getImageData(0, 0, sample.width, sample.height).data;
    const colors = new Set();
    let opaque = 0;
    let light = 0;
    let dark = 0;
    let turf = 0;
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      if (alpha > 240) opaque += 1;
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      if (luminance > 190) light += 1;
      if (luminance < 100) dark += 1;
      if (green > red * 1.14 && green > blue * 1.12) turf += 1;
      colors.add(`${red >> 4}-${green >> 4}-${blue >> 4}`);
    }
    return { opaqueRatio: opaque / (data.length / 4), light, dark, turf, distinctColors: colors.size };
  });
  assert.ok(pixels.opaqueRatio > 0.98, `${name}: canvas is not fully rendered: ${JSON.stringify(pixels)}`);
  assert.ok(pixels.distinctColors > 18, `${name}: canvas has insufficient visual variance: ${JSON.stringify(pixels)}`);
  assert.ok(pixels.light > 50 && pixels.turf > 1000, `${name}: pitch or markings are missing: ${JSON.stringify(pixels)}`);

  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 300 && box.height >= 370, `${name}: canvas is incorrectly sized`);
  const revisionBefore = Number(await canvas.getAttribute("data-camera-revision"));
  await canvas.evaluate((element) => {
    element.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 3, clientX: 120, clientY: 120, bubbles: true }));
    element.dispatchEvent(new PointerEvent("pointermove", { pointerId: 3, clientX: 180, clientY: 90, bubbles: true }));
    element.dispatchEvent(new PointerEvent("pointerup", { pointerId: 3, clientX: 180, clientY: 90, bubbles: true }));
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: 180, bubbles: true, cancelable: true }));
  });
  const revisionAfter = Number(await canvas.getAttribute("data-camera-revision"));
  assert.ok(revisionAfter > revisionBefore, `${name}: camera interaction did not update (${revisionBefore} -> ${revisionAfter})`);

  const layout = await page.evaluate(() => {
    const scene = document.querySelector(".keeper-scene-shell").getBoundingClientRect();
    const tools = document.querySelector(".keeper-scene-tools").getBoundingClientRect();
    const legend = document.querySelector(".keeper-scene-legend").getBoundingClientRect();
    return {
      bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      toolsInside: tools.left >= scene.left && tools.right <= scene.right && tools.top >= scene.top,
      legendInside: legend.left >= scene.left && legend.right <= scene.right && legend.bottom <= scene.bottom,
      controlsOverlap: !(tools.bottom < legend.top || tools.top > legend.bottom || tools.right < legend.left || tools.left > legend.right),
      gaps: document.querySelectorAll("[data-gap-id]").length,
      trajectories: Number(document.querySelector("#keeperCanvas").dataset.trajectoryCount)
    };
  });
  assert.ok(layout.bodyOverflow <= 1, `${name}: page has ${layout.bodyOverflow}px horizontal overflow`);
  assert.equal(layout.toolsInside, true, `${name}: camera tools escape the scene`);
  assert.equal(layout.legendInside, true, `${name}: legend escapes the scene`);
  assert.equal(layout.controlsOverlap, false, `${name}: scene controls overlap the legend`);
  assert.ok(layout.gaps > 0, `${name}: ingress gap queue is empty`);
  assert.ok(layout.trajectories > 0, `${name}: no coded trajectory reached Three.js`);
  assert.equal(await page.locator("#clipSource").inputValue(), "concacaf", `${name}: official Concacaf source is not the default`);
  assert.doesNotMatch(await page.locator("#serverServiceState").textContent(), /static mode/i, `${name}: AVI evidence server was not detected`);
  assert.deepEqual(errors, [], `${name}: browser errors: ${errors.join(" | ")}`);

  await page.locator("#resetKeeperCamera").click();
  await page.waitForTimeout(120);
  await page.screenshot({ path: `/tmp/keeper-lab-${name}.png`, fullPage: true });

  if (name === "desktop") {
    await page.locator("#broadcastFile").setInputFiles("/tmp/avi-broadcast-test.mp4");
    await page.waitForFunction(() => Number.isFinite(document.querySelector("#broadcastVideo").duration));
    const trackingCanvas = page.locator("#trackingCanvas");
    const trackingBox = await trackingCanvas.boundingBox();
    const mark = async (x, y) => trackingCanvas.click({ position: { x: trackingBox.width * x, y: trackingBox.height * y } });
    await page.locator('[data-track-tool="pitch"]').click();
    for (const [landmark, x, y] of [
      ["penalty-left-goal", 0.2, 0.25], ["penalty-right-goal", 0.8, 0.25],
      ["penalty-left-front", 0.1, 0.85], ["penalty-right-front", 0.9, 0.85]
    ]) {
      await page.locator("#pitchLandmark").selectOption(landmark);
      await mark(x, y);
    }
    assert.match(await page.locator("#trackingStatus").textContent(), /homography solved/i);
    await page.locator('[data-track-tool="goal"]').click();
    await mark(0.45, 0.45); await mark(0.55, 0.45); await mark(0.55, 0.3); await mark(0.45, 0.3);
    assert.match(await page.locator("#trackingStatus").textContent(), /goal frame calibrated/i);
    await page.locator('[data-track-tool="ball"]').click();
    await page.evaluate(() => { document.querySelector("#broadcastVideo").currentTime = 0.2; });
    await mark(0.5, 0.7);
    await page.evaluate(() => { document.querySelector("#broadcastVideo").currentTime = 0.8; });
    await mark(0.52, 0.4);
    await page.locator("#inferTrackedGoals").click();
    assert.equal(await page.locator("#broadcastCandidateCount").textContent(), "1 found");
    await page.locator(".candidate-row").first().click();
    assert.match(await page.locator("#wizardClipUrl").inputValue(), /^local-video:/);
    await page.locator("#addTimelineMarker").click();
    assert.ok(await page.locator(".timeline-marker").count() >= 4);
    await page.evaluate(() => window.aviRegisterBroadcastTracker(async () => ({ frames: [{ trackId: "svg-7", type: "player", team: "svg", time: 1.2, x: 0.3, y: 0.62 }] })));
    await page.locator("#runAutoTracking").click();
    assert.match(await page.locator("#trackingStatus").textContent(), /1 tracking keyframes imported/i);
    await page.locator("#transcribeBroadcast").click();
    await page.waitForFunction(() => document.querySelector("#trackingStatus").textContent.includes("GROQ_API_KEY"));

    await page.locator("#runGoblin").click();
    assert.match(await page.locator("#goblinStatus").textContent(), /compound research completed/i);
    assert.equal(await page.locator("#goblinResearchTrace li").count(), 5);
    assert.match(await page.locator("#goblinResearchSummary").textContent(), /sources/i);
    await page.locator("#wizardClipUrl").fill("https://www.youtube.com/watch?v=abc123");
    await page.evaluate(() => window.aviRegisterVideoModelAdapter(async () => ({
      minute: 54,
      situation: "open-play",
      shotOrigin: "Left side of penalty area",
      goalZone: "Low right",
      confidence: 0.81
    })));
    await page.locator("#runVideoModel").click();
    assert.equal(await page.locator("#wizardOrigin").inputValue(), "Left side of penalty area");
    assert.equal(await page.locator("#wizardGoalZone").inputValue(), "Low right");
    assert.equal(await page.locator("#wizardEvidenceState").textContent(), "Provisional");
    const gapsBeforeSave = Number((await page.locator("#gapCount").textContent()).match(/\d+/)?.[0]);
    await page.locator("#saveKeeperAction").click();
    assert.equal(await page.locator("#wizardEvidenceState").textContent(), "Validated");
    const gapsAfterSave = Number((await page.locator("#gapCount").textContent()).match(/\d+/)?.[0]);
    assert.equal(gapsAfterSave, gapsBeforeSave - 1);
    await page.evaluate(() => {
      localStorage.removeItem("avi-goalkeeper-events");
      localStorage.removeItem("avi-goblin-ingress-queue");
    });
  }
  await page.close();
  return { viewport, pixels, layout, screenshot: `/tmp/keeper-lab-${name}.png` };
}

try {
  const results = [];
  results.push(await verifyViewport("desktop", { width: 1440, height: 1000 }));
  results.push(await verifyViewport("mobile", { width: 390, height: 844 }));
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} finally {
  await browser.close();
}
