const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;

const LAND = [
  [[-168,72],[-140,70],[-125,58],[-124,48],[-114,31],[-97,16],[-82,8],[-77,18],[-60,47],[-53,54],[-64,62],[-100,72]],
  [[-82,12],[-72,9],[-50,5],[-35,-8],[-39,-24],[-55,-55],[-73,-52],[-81,-20]],
  [[-10,36],[-17,15],[-9,-5],[10,-35],[32,-35],[51,-12],[43,12],[32,31],[10,37]],
  [[-10,36],[5,43],[30,46],[42,57],[72,70],[122,72],[164,58],[145,42],[121,24],[105,4],[75,8],[55,25],[35,32]],
  [[112,-10],[154,-10],[153,-39],[132,-44],[113,-30]],
  [[-53,60],[-31,64],[-20,80],[-47,83],[-65,73]],
  [[46,-13],[51,-14],[50,-26],[44,-25]]
];

function project({ lat, lon }) {
  return { x: (lon + 180) / 360 * MAP_WIDTH, y: (90 - lat) / 180 * MAP_HEIGHT };
}

function xml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character]);
}

function fitViewBox(points) {
  if (!points.length) return "0 0 1000 500";
  let minX = Math.min(...points.map((point) => point.x));
  let maxX = Math.max(...points.map((point) => point.x));
  let minY = Math.min(...points.map((point) => point.y));
  let maxY = Math.max(...points.map((point) => point.y));
  const targetWidth = Math.max(260, maxX - minX + 110);
  const targetHeight = Math.max(180, maxY - minY + 100);
  const ratio = 2.15;
  const width = Math.min(MAP_WIDTH, Math.max(targetWidth, targetHeight * ratio));
  const height = Math.min(MAP_HEIGHT, Math.max(targetHeight, targetWidth / ratio));
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  minX = Math.max(0, Math.min(MAP_WIDTH - width, centreX - width / 2));
  minY = Math.max(0, Math.min(MAP_HEIGHT - height, centreY - height / 2));
  return `${minX.toFixed(1)} ${minY.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}`;
}

export function buildPathMapModel(pathTracker, players, categories) {
  const origins = new Map();
  for (const player of players ?? []) {
    const origin = pathTracker.originFor(player);
    const airport = pathTracker.airports.get(origin.airport);
    if (!airport) continue;
    const existing = origins.get(airport.code) ?? { airport, players: [], basis: origin.basis };
    existing.players.push(player.name);
    origins.set(airport.code, existing);
  }
  const routes = [];
  (categories ?? []).forEach((category, categoryIndex) => {
    for (const origin of origins.values()) {
      const itinerary = pathTracker.route(origin.airport.code, category.destinationAirport, category.date);
      const airports = itinerary.airports.map((code) => pathTracker.airports.get(code)).filter(Boolean);
      routes.push({
        category,
        categoryIndex,
        origin: origin.airport,
        destination: pathTracker.airports.get(category.destinationAirport),
        airports,
        playerCount: origin.players.length,
        players: origin.players,
        itinerary
      });
    }
  });
  const points = routes.flatMap((route) => route.airports.map(project));
  return {
    origins: [...origins.values()],
    categories,
    routes,
    viewBox: fitViewBox(points),
    playerCount: [...origins.values()].reduce((total, origin) => total + origin.players.length, 0)
  };
}

function curvePath(route) {
  const points = route.airports.map(project);
  if (points.length < 2) return "";
  return points.slice(1).reduce((path, point, index) => {
    const start = points[index];
    const bend = 18 + route.categoryIndex * 12;
    const controlX = (start.x + point.x) / 2;
    const controlY = (start.y + point.y) / 2 - bend;
    return `${path} Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`);
}

export function createPathMapSvg(model) {
  const land = LAND.map((polygon) => `<polygon class="path-map-land" points="${polygon.map(([lon, lat]) => { const point = project({ lon, lat }); return `${point.x.toFixed(1)},${point.y.toFixed(1)}`; }).join(" ")}"/>`).join("");
  const grid = [30, 60, 90, 120, 150, 210, 240, 270, 300, 330].map((x) => `<line class="path-map-gridline" x1="${x / 360 * MAP_WIDTH}" y1="0" x2="${x / 360 * MAP_WIDTH}" y2="500"/>`)
    .join("") + [60, 120, 180, 240, 300, 360, 420].map((y) => `<line class="path-map-gridline" x1="0" y1="${y}" x2="1000" y2="${y}"/>`).join("");
  const routes = model.routes.map((route) => `<path class="path-map-route" data-category="${xml(route.category.categoryId)}" d="${curvePath(route)}" style="--route:${xml(route.category.color)};--route-width:${Math.min(5, 1.5 + Math.sqrt(route.playerCount)).toFixed(1)}"><title>${xml(`${route.category.label}: ${route.playerCount} player${route.playerCount === 1 ? "" : "s"} · ${route.origin.code} to ${route.destination?.code ?? route.category.destinationAirport}`)}</title></path>`).join("");
  const origins = model.origins.map(({ airport, players }) => { const point = project(airport); return `<g class="path-map-origin" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})"><circle r="${Math.min(9, 4 + Math.sqrt(players.length)).toFixed(1)}"/><text x="8" y="-7">${xml(airport.code)}</text><title>${xml(`${airport.name}: ${players.length} player${players.length === 1 ? "" : "s"}`)}</title></g>`; }).join("");
  const destinations = (model.categories ?? []).map((category, index) => {
    const airport = model.routes.find((route) => route.category.categoryId === category.categoryId)?.destination;
    if (!airport) return "";
    const point = project(airport);
    const offset = index * 8;
    return `<g class="path-map-destination" transform="translate(${(point.x + offset).toFixed(1)} ${(point.y + offset).toFixed(1)})" style="--route:${xml(category.color)}"><rect x="-6" y="-6" width="12" height="12" transform="rotate(45)"/><text x="10" y="5">${xml(category.label)} · ${xml(airport.code)}</text></g>`;
  }).join("");
  return `${grid}${land}${routes}${origins}${destinations}`;
}
