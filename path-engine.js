export class PathTracker {
  constructor(config) {
    this.config = config;
    this.airports = new Map(config.airports.map(([code, name, lat, lon]) => [code, { code, name, lat, lon }]));
    this.graph = new Map([...this.airports.keys()].map((code) => [code, []]));
    for (const [from, to] of config.routes) {
      const distanceKm = haversine(this.airports.get(from), this.airports.get(to));
      const flightHours = distanceKm / 780 + .65;
      this.graph.get(from)?.push({ to, distanceKm, flightHours });
      this.graph.get(to)?.push({ to: from, distanceKm, flightHours });
    }
    this.transfers = readJson("avi-path-transfers", {});
    this.flightOptions = readJson("avi-path-flight-options", []);
    this.scheduleRecords = readJson("avi-path-schedules", []);
  }

  originFor(player) {
    const transfer = this.transfers[player.name];
    if (transfer?.airport && this.airports.has(transfer.airport)) return { airport: transfer.airport, basis: "Transfer update", club: transfer.club ?? player.club };
    const countryCode = [...player.club.matchAll(/\(([A-Z]{3})\)/g)].at(-1)?.[1] ?? "VIN";
    return { airport: this.config.clubCountryAirport[countryCode] ?? "SVD", basis: "Home-airport fallback", club: player.club };
  }

  route(origin, destination, departureDate = null) {
    const live = this.flightOptions
      .filter((option) => option.origin === origin && option.destination === destination)
      .filter((option) => !departureDate || option.departureDate === departureDate)
      .sort((a, b) => a.durationHours - b.durationHours)[0];
    if (live) return { ...live, source: live.source ?? "amadeus", estimated: false };
    return this.shortestRoute(origin, destination);
  }

  shortestRoute(origin, destination) {
    if (origin === destination) return { airports: [origin], distanceKm: 0, durationHours: .75, source: "ground/local", estimated: true };
    const costs = new Map([[origin, 0]]);
    const previous = new Map();
    const queue = [{ code: origin, cost: 0 }];
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift();
      if (current.code === destination) break;
      for (const edge of this.graph.get(current.code) ?? []) {
        const cost = current.cost + edge.flightHours + (current.code === origin ? 0 : .9);
        if (cost < (costs.get(edge.to) ?? Infinity)) {
          costs.set(edge.to, cost);
          previous.set(edge.to, { code: current.code, edge });
          queue.push({ code: edge.to, cost });
        }
      }
    }
    if (!costs.has(destination)) return { airports: [origin, destination], distanceKm: haversine(this.airports.get(origin), this.airports.get(destination)), durationHours: Infinity, source: "unresolved", estimated: true };
    const airports = [destination];
    let cursor = destination;
    let distanceKm = 0;
    while (previous.has(cursor)) {
      const step = previous.get(cursor);
      distanceKm += step.edge.distanceKm;
      cursor = step.code;
      airports.unshift(cursor);
    }
    return { airports, distanceKm, durationHours: costs.get(destination) + 1.1, source: "route-model", estimated: true };
  }

  calculatePlayer(player, destination, qualificationStatus) {
    const origin = this.originFor(player);
    const inbound = this.route(origin.airport, destination);
    const records = this.scheduleRecords.filter((record) => record.player === player.name);
    const completedRecords = records.filter((record) => record.status === "completed");
    const scheduledRecords = records.filter((record) => record.status === "scheduled" && record.active !== false)
      .filter((record) => record.domain !== "international" || qualificationStatus !== "eliminated");
    if (completedRecords.length || scheduledRecords.length) {
      const completed = completedRecords.map((record) => this.calculateJourney(record, origin.airport, destination));
      const remaining = scheduledRecords.map((record) => this.calculateJourney(record, origin.airport, destination));
      const clubRemaining = remaining.filter((journey) => journey.record.domain === "club");
      const internationalRemaining = remaining.filter((journey) => journey.record.domain === "international");
      return {
        player, origin, inbound,
        completedClubAway: completed.filter((journey) => journey.record.domain === "club").length,
        completedInternational: completed.filter((journey) => journey.record.domain === "international").length,
        remainingClubAway: clubRemaining.length,
        remainingInternational: internationalRemaining.length,
        cumulativeHours: sum(completed, "durationHours"),
        cumulativeKm: sum(completed, "distanceKm"),
        remainingClubHours: sum(clubRemaining, "durationHours"),
        remainingInternationalHours: sum(internationalRemaining, "durationHours"),
        predictedHours: sum(remaining, "durationHours"),
        scheduleBasis: "ingested"
      };
    }
    const hash = stableHash(player.name);
    const completedClubAway = 8 + hash % 9;
    const completedInternational = 3 + hash % 4;
    const remainingClubAway = 7 + (hash >>> 2) % 10;
    const remainingInternational = qualificationStatus === "qualified" ? 8 : qualificationStatus === "active" ? 5 : 0;
    const clubHoursPerLeg = origin.airport === "SVD" ? 1.3 : 1.9;
    const clubKmPerLeg = origin.airport === "SVD" ? 180 : 520;
    const cumulativeHours = completedClubAway * clubHoursPerLeg + completedInternational * inbound.durationHours * 2;
    const cumulativeKm = completedClubAway * clubKmPerLeg + completedInternational * inbound.distanceKm * 2;
    const remainingClubHours = remainingClubAway * clubHoursPerLeg;
    const remainingInternationalHours = remainingInternational * inbound.durationHours * 2;
    return {
      player, origin, inbound, completedClubAway, completedInternational, remainingClubAway, remainingInternational,
      cumulativeHours, cumulativeKm, remainingClubHours, remainingInternationalHours,
      predictedHours: remainingClubHours + remainingInternationalHours,
      scheduleBasis: "modelled"
    };
  }

  calculateJourney(record, fallbackOrigin, fallbackDestination) {
    const origin = record.originAirport ?? fallbackOrigin;
    const destination = record.destinationAirport ?? fallbackDestination;
    const route = this.route(origin, destination, record.departureDate ?? null);
    const multiplier = record.returnRequired === false ? 1 : 2;
    return {
      record,
      distanceKm: Number(record.distanceKm ?? route.distanceKm * multiplier),
      durationHours: Number(record.durationHours ?? route.durationHours * multiplier)
    };
  }

  applyTransfer(playerName, club, airport) {
    this.transfers[playerName] = { club, airport, effectiveAt: new Date().toISOString() };
    writeJson("avi-path-transfers", this.transfers);
  }

  ingestFlightOptions(options) {
    this.flightOptions.push(...options);
    writeJson("avi-path-flight-options", this.flightOptions);
  }

  ingestScheduleRecords(records) {
    this.scheduleRecords.push(...records);
    writeJson("avi-path-schedules", this.scheduleRecords);
  }
}

function haversine(a, b) {
  if (!a || !b) return 0;
  const rad = (degrees) => degrees * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function stableHash(value) {
  let hash = 0;
  for (const character of value) hash = ((hash << 5) - hash + character.charCodeAt(0)) >>> 0;
  return hash;
}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional in test and private contexts. */ }
}

function sum(records, key) {
  return records.reduce((total, record) => total + (Number(record[key]) || 0), 0);
}
