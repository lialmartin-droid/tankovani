export function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const odometerDifference = Number(a.odometer) - Number(b.odometer);
    if (odometerDifference !== 0) return odometerDifference;
    const dateDifference = String(a.date).localeCompare(String(b.date));
    if (dateDifference !== 0) return dateDifference;
    return String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id));
  });
}

export function calculateIntervals(entries) {
  const ordered = sortEntries(entries);
  const intervals = [];
  let previousFullIndex = -1;

  ordered.forEach((entry, index) => {
    if (!entry.fullTank) return;

    if (previousFullIndex >= 0) {
      const previous = ordered[previousFullIndex];
      const distance = Number(entry.odometer) - Number(previous.odometer);
      const included = ordered.slice(previousFullIndex + 1, index + 1);
      const liters = included.reduce((sum, item) => sum + Number(item.liters || 0), 0);
      const cost = included.reduce((sum, item) => sum + Number(item.total || 0), 0);

      if (distance > 0 && liters > 0) {
        intervals.push({
          entryId: entry.id,
          fromEntryId: previous.id,
          date: entry.date,
          distance,
          liters: round(liters, 3),
          cost: round(cost, 2),
          consumption: round((liters / distance) * 100, 2),
          costPerKm: round(cost / distance, 2),
        });
      }
    }

    previousFullIndex = index;
  });

  return intervals;
}

export function calculateSummary(entries, now = new Date()) {
  const ordered = sortEntries(entries);
  const intervals = calculateIntervals(ordered);
  const totalSpent = ordered.reduce((sum, entry) => sum + Number(entry.total || 0), 0);
  const totalLiters = ordered.reduce((sum, entry) => sum + Number(entry.liters || 0), 0);
  const intervalDistance = intervals.reduce((sum, interval) => sum + interval.distance, 0);
  const intervalLiters = intervals.reduce((sum, interval) => sum + interval.liters, 0);
  const intervalCost = intervals.reduce((sum, interval) => sum + interval.cost, 0);
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthSpent = ordered
    .filter((entry) => String(entry.date).startsWith(monthPrefix))
    .reduce((sum, entry) => sum + Number(entry.total || 0), 0);
  const latest = ordered.at(-1) || null;
  const previous = ordered.at(-2) || null;

  return {
    totalSpent: round(totalSpent, 2),
    totalLiters: round(totalLiters, 3),
    averagePrice: totalLiters > 0 ? round(totalSpent / totalLiters, 2) : null,
    averageConsumption: intervalDistance > 0 ? round((intervalLiters / intervalDistance) * 100, 2) : null,
    averageCostPerKm: intervalDistance > 0 ? round(intervalCost / intervalDistance, 2) : null,
    intervalDistance,
    monthSpent: round(monthSpent, 2),
    latest,
    sincePreviousKm: latest && previous ? Math.max(0, Number(latest.odometer) - Number(previous.odometer)) : null,
    intervals,
  };
}

export function monthlyTotals(entries) {
  const months = new Map();
  sortEntries(entries).forEach((entry) => {
    const key = String(entry.date).slice(0, 7);
    const current = months.get(key) || { month: key, total: 0, liters: 0, count: 0 };
    current.total += Number(entry.total || 0);
    current.liters += Number(entry.liters || 0);
    current.count += 1;
    months.set(key, current);
  });
  return [...months.values()].map((item) => ({
    ...item,
    total: round(item.total, 2),
    liters: round(item.liters, 3),
  }));
}

export function calculatePriceSummary(entries) {
  const usable = entries.filter((entry) => Number(entry.liters) > 0 && Number(entry.price) > 0);
  if (!usable.length) {
    return { average: null, lowest: null, highest: null, difference: null };
  }

  const liters = usable.reduce((sum, entry) => sum + Number(entry.liters), 0);
  const cost = usable.reduce((sum, entry) => sum + Number(entry.total || Number(entry.liters) * Number(entry.price)), 0);
  const prices = usable.map((entry) => Number(entry.price));

  return {
    average: liters > 0 ? round(cost / liters, 2) : null,
    lowest: round(Math.min(...prices), 2),
    highest: round(Math.max(...prices), 2),
    difference: round(Math.max(...prices) - Math.min(...prices), 2),
  };
}

export function calculateStationStats(entries) {
  const stations = new Map();

  entries.forEach((entry) => {
    if (!(Number(entry.liters) > 0) || !(Number(entry.price) > 0)) return;
    const name = String(entry.station || "Neuvedeno").trim() || "Neuvedeno";
    const key = name.toLocaleLowerCase("cs-CZ");
    const current = stations.get(key) || {
      name,
      count: 0,
      liters: 0,
      total: 0,
      lowest: Infinity,
      highest: -Infinity,
    };

    current.count += 1;
    current.liters += Number(entry.liters);
    current.total += Number(entry.total || Number(entry.liters) * Number(entry.price));
    current.lowest = Math.min(current.lowest, Number(entry.price));
    current.highest = Math.max(current.highest, Number(entry.price));
    stations.set(key, current);
  });

  return [...stations.values()]
    .map((station) => ({
      ...station,
      liters: round(station.liters, 2),
      total: round(station.total, 2),
      averagePrice: station.liters > 0 ? round(station.total / station.liters, 2) : null,
      lowest: round(station.lowest, 2),
      highest: round(station.highest, 2),
    }))
    .sort((a, b) => b.count - a.count || b.liters - a.liters || a.name.localeCompare(b.name, "cs"));
}
