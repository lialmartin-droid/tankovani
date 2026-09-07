import {
  calculateIntervals,
  calculatePriceSummary,
  calculateStationStats,
  calculateSummary,
  parseNumber,
  round,
  sortEntries,
} from "./calc.js";

const STORAGE_KEY = "moje-tankovani:v1";
const DEFAULT_STATE = {
  version: 1,
  vehicle: {
    name: "Hyundai i20",
    engine: "1.2",
    year: "2016",
    fuel: "Natural 95",
  },
  settings: {
    theme: "system",
  },
  entries: [],
};

const moneyFormat = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});
const preciseMoneyFormat = new Intl.NumberFormat("cs-CZ", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numberFormat = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 });
const integerFormat = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
const shortDateFormat = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "short" });
const monthQuery = window.matchMedia("(prefers-color-scheme: dark)");

let state = loadState();
let toastTimer;
let currentView = "overview";
let confirmResolver = null;

const refs = {
  views: [...document.querySelectorAll(".view")],
  navItems: [...document.querySelectorAll("[data-nav]")],
  vehicleName: document.querySelector("#vehicleName"),
  vehicleDetail: document.querySelector("#vehicleDetail"),
  averageConsumption: document.querySelector("#averageConsumption"),
  gaugeArc: document.querySelector("#gaugeArc"),
  gaugeNeedle: document.querySelector("#gaugeNeedle"),
  intervalCount: document.querySelector("#intervalCount"),
  monthSpent: document.querySelector("#monthSpent"),
  monthRefuels: document.querySelector("#monthRefuels"),
  averagePrice: document.querySelector("#averagePrice"),
  lastOdometerHint: document.querySelector("#lastOdometerHint"),
  recentEntry: document.querySelector("#recentEntry"),
  firstTankTip: document.querySelector("#firstTankTip"),
  historySpent: document.querySelector("#historySpent"),
  historyLiters: document.querySelector("#historyLiters"),
  historyList: document.querySelector("#historyList"),
  historyEmpty: document.querySelector("#historyEmpty"),
  statsConsumption: document.querySelector("#statsConsumption"),
  statsCostKm: document.querySelector("#statsCostKm"),
  statsSpent: document.querySelector("#statsSpent"),
  statsRefuels: document.querySelector("#statsRefuels"),
  statsDistance: document.querySelector("#statsDistance"),
  statsAveragePrice: document.querySelector("#statsAveragePrice"),
  statsLowestPrice: document.querySelector("#statsLowestPrice"),
  statsHighestPrice: document.querySelector("#statsHighestPrice"),
  priceDifference: document.querySelector("#priceDifference"),
  priceChart: document.querySelector("#priceChart"),
  stationStats: document.querySelector("#stationStats"),
  consumptionTrend: document.querySelector("#consumptionTrend"),
  consumptionChart: document.querySelector("#consumptionChart"),
  costChart: document.querySelector("#costChart"),
  vehicleForm: document.querySelector("#vehicleForm"),
  settingVehicleName: document.querySelector("#settingVehicleName"),
  settingEngine: document.querySelector("#settingEngine"),
  settingYear: document.querySelector("#settingYear"),
  settingFuel: document.querySelector("#settingFuel"),
  themeButtons: [...document.querySelectorAll("[data-theme-choice]")],
  fuelDialog: document.querySelector("#fuelDialog"),
  fuelForm: document.querySelector("#fuelForm"),
  fuelFormEyebrow: document.querySelector("#fuelFormEyebrow"),
  fuelFormTitle: document.querySelector("#fuelFormTitle"),
  entryId: document.querySelector("#entryId"),
  fuelDate: document.querySelector("#fuelDate"),
  fuelOdometer: document.querySelector("#fuelOdometer"),
  fuelLiters: document.querySelector("#fuelLiters"),
  fuelPrice: document.querySelector("#fuelPrice"),
  fuelTotal: document.querySelector("#fuelTotal"),
  fuelFullTank: document.querySelector("#fuelFullTank"),
  fuelStation: document.querySelector("#fuelStation"),
  fuelNote: document.querySelector("#fuelNote"),
  fuelFormError: document.querySelector("#fuelFormError"),
  deleteEntry: document.querySelector("#deleteEntry"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmText: document.querySelector("#confirmText"),
  confirmAccept: document.querySelector(".accept-confirm"),
  confirmCancel: document.querySelector(".cancel-confirm"),
  importFile: document.querySelector("#importFile"),
  toast: document.querySelector("#toast"),
};

initialize();

function initialize() {
  applyTheme();
  bindNavigation();
  bindEntryForm();
  bindSettings();
  bindConfirmDialog();
  renderAll();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.entries)) return cloneDefaultState();
    return {
      version: 1,
      vehicle: { ...DEFAULT_STATE.vehicle, ...(saved.vehicle || {}) },
      settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
      entries: saved.entries.map(normalizeEntry).filter(Boolean),
    };
  } catch {
    return cloneDefaultState();
  }
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const odometer = Number(entry.odometer);
  const liters = Number(entry.liters);
  const price = Number(entry.price);
  const total = Number(entry.total);
  if (!entry.date || !Number.isFinite(odometer) || !Number.isFinite(liters) || !Number.isFinite(total)) return null;
  return {
    id: String(entry.id || makeId()),
    date: String(entry.date).slice(0, 10),
    odometer: round(odometer, 0),
    liters: round(liters, 3),
    price: Number.isFinite(price) ? round(price, 3) : round(total / liters, 3),
    total: round(total, 2),
    fullTank: Boolean(entry.fullTank),
    station: String(entry.station || "").slice(0, 40),
    note: String(entry.note || "").slice(0, 120),
    createdAt: String(entry.createdAt || new Date().toISOString()),
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindNavigation() {
  refs.navItems.forEach((button) => button.addEventListener("click", () => showView(button.dataset.nav)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
  document.querySelectorAll("[data-add-entry]").forEach((button) => button.addEventListener("click", () => openFuelDialog()));
  document.querySelector("#overviewAdd").addEventListener("click", () => openFuelDialog());
  document.querySelector("#navAdd").addEventListener("click", () => openFuelDialog());
  document.querySelector("#quickTheme").addEventListener("click", toggleQuickTheme);

  refs.historyList.addEventListener("click", (event) => {
    const entryButton = event.target.closest("[data-entry-id]");
    if (entryButton) openFuelDialog(entryButton.dataset.entryId);
  });

  refs.recentEntry.addEventListener("click", (event) => {
    const entryButton = event.target.closest("[data-entry-id]");
    if (entryButton) openFuelDialog(entryButton.dataset.entryId);
  });
}

function showView(view) {
  if (!document.querySelector(`[data-view="${view}"]`)) return;
  currentView = view;
  refs.views.forEach((section) => {
    const active = section.dataset.view === view;
    section.hidden = !active;
    section.classList.toggle("is-active", active);
  });
  refs.navItems.forEach((button) => {
    const active = button.dataset.nav === view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindEntryForm() {
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => refs.fuelDialog.close()));
  refs.fuelForm.addEventListener("submit", saveEntryFromForm);
  refs.deleteEntry.addEventListener("click", deleteCurrentEntry);

  refs.fuelLiters.addEventListener("input", () => recalculateFuelAmounts("liters"));
  refs.fuelPrice.addEventListener("input", () => recalculateFuelAmounts("price"));
  refs.fuelTotal.addEventListener("input", () => recalculateFuelAmounts("total"));
  [refs.fuelLiters, refs.fuelPrice, refs.fuelTotal].forEach((input) => {
    input.addEventListener("blur", () => normalizeNumericInput(input));
  });

  refs.fuelDialog.addEventListener("click", (event) => {
    const rect = refs.fuelDialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) refs.fuelDialog.close();
  });
}

function openFuelDialog(entryId = null) {
  refs.fuelForm.reset();
  refs.fuelFormError.hidden = true;
  refs.fuelFormError.textContent = "";
  refs.entryId.value = "";
  refs.fuelDate.max = todayIso();
  refs.fuelDate.value = todayIso();
  refs.fuelFullTank.checked = true;

  const ordered = sortEntries(state.entries);
  const latest = ordered.at(-1);
  const entryToEdit = entryId ? state.entries.find((item) => item.id === entryId) : null;
  refs.fuelOdometer.placeholder = latest ? integerFormat.format(latest.odometer) : "125 430";
  if (latest) refs.fuelPrice.value = formatInput(latest.price, 2);
  refs.fuelStation.querySelectorAll("[data-legacy]").forEach((option) => option.remove());

  if (entryToEdit) {
    refs.fuelFormEyebrow.textContent = "Úprava záznamu";
    refs.fuelFormTitle.textContent = formatDate(entryToEdit.date);
    refs.entryId.value = entryToEdit.id;
    refs.fuelDate.value = entryToEdit.date;
    refs.fuelOdometer.value = integerFormat.format(entryToEdit.odometer).replace(/\u00a0/g, " ");
    refs.fuelLiters.value = formatInput(entryToEdit.liters, entryToEdit.liters % 1 ? 2 : 0);
    refs.fuelPrice.value = formatInput(entryToEdit.price, 2);
    refs.fuelTotal.value = formatInput(entryToEdit.total, 2);
    refs.fuelFullTank.checked = entryToEdit.fullTank;
    setStationChoice(entryToEdit.station);
    refs.fuelNote.value = entryToEdit.note;
    refs.deleteEntry.hidden = false;
  } else {
    refs.fuelFormEyebrow.textContent = "Nový záznam";
    refs.fuelFormTitle.textContent = "Tankování";
    refs.deleteEntry.hidden = true;
    if (latest?.station) setStationChoice(latest.station);
  }

  refs.fuelDialog.showModal();
  window.setTimeout(() => refs.fuelOdometer.focus(), 120);
}

function setStationChoice(station) {
  if (!station) return;
  const exists = [...refs.fuelStation.options].some((option) => option.value === station);
  if (!exists) {
    const legacyOption = document.createElement("option");
    legacyOption.value = station;
    legacyOption.textContent = station;
    legacyOption.dataset.legacy = "true";
    refs.fuelStation.append(legacyOption);
  }
  refs.fuelStation.value = station;
}

function recalculateFuelAmounts(source) {
  const liters = parseNumber(refs.fuelLiters.value);
  const price = parseNumber(refs.fuelPrice.value);
  const total = parseNumber(refs.fuelTotal.value);

  if (!liters || liters <= 0) return;
  if ((source === "liters" || source === "price") && price && price > 0) {
    refs.fuelTotal.value = formatInput(liters * price, 2);
  } else if (source === "total" && total && total > 0) {
    refs.fuelPrice.value = formatInput(total / liters, 2);
  }
}

function normalizeNumericInput(input) {
  const value = parseNumber(input.value);
  if (value === null) return;
  const places = input === refs.fuelOdometer ? 0 : 2;
  input.value = formatInput(value, places);
}

function saveEntryFromForm(event) {
  event.preventDefault();
  const entry = readEntryForm();
  const error = validateEntry(entry);
  if (error) {
    refs.fuelFormError.textContent = error;
    refs.fuelFormError.hidden = false;
    return;
  }

  const existingIndex = state.entries.findIndex((item) => item.id === entry.id);
  if (existingIndex >= 0) state.entries[existingIndex] = { ...state.entries[existingIndex], ...entry };
  else state.entries.push(entry);

  saveState();
  refs.fuelDialog.close();
  renderAll();
  showToast(existingIndex >= 0 ? "Tankování bylo upraveno" : "Tankování bylo uloženo");
}

function readEntryForm() {
  const liters = parseNumber(refs.fuelLiters.value);
  let price = parseNumber(refs.fuelPrice.value);
  let total = parseNumber(refs.fuelTotal.value);
  if (liters && price && !total) total = liters * price;
  if (liters && total && !price) price = total / liters;

  return {
    id: refs.entryId.value || makeId(),
    date: refs.fuelDate.value,
    odometer: parseNumber(refs.fuelOdometer.value),
    liters,
    price,
    total,
    fullTank: refs.fuelFullTank.checked,
    station: refs.fuelStation.value.trim().slice(0, 40),
    note: refs.fuelNote.value.trim().slice(0, 120),
    createdAt: refs.entryId.value
      ? state.entries.find((entry) => entry.id === refs.entryId.value)?.createdAt || new Date().toISOString()
      : new Date().toISOString(),
  };
}

function validateEntry(entry) {
  if (!entry.date) return "Vyber datum tankování.";
  if (entry.date > todayIso()) return "Datum tankování nemůže být v budoucnu.";
  if (!Number.isFinite(entry.odometer) || entry.odometer <= 0) return "Zadej platný stav tachometru.";
  if (!Number.isFinite(entry.liters) || entry.liters <= 0 || entry.liters > 200) return "Zadej platný počet litrů.";
  if (!Number.isFinite(entry.price) || entry.price <= 0 || entry.price > 250) return "Zadej platnou cenu za litr.";
  if (!Number.isFinite(entry.total) || entry.total <= 0 || entry.total > 50000) return "Zadej platnou celkovou cenu.";
  if (!entry.station) return "Vyber čerpací stanici.";
  return null;
}

async function deleteCurrentEntry() {
  const id = refs.entryId.value;
  if (!id) return;
  const accepted = await askConfirm("Smazat tankování?", "Záznam bude trvale odstraněn a spotřeba se přepočítá.", "Smazat");
  if (!accepted) return;
  state.entries = state.entries.filter((entry) => entry.id !== id);
  saveState();
  refs.fuelDialog.close();
  renderAll();
  showToast("Tankování bylo smazáno");
}

function bindSettings() {
  refs.vehicleForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = refs.settingVehicleName.value.trim();
    if (!name) {
      refs.settingVehicleName.focus();
      return;
    }
    state.vehicle = {
      name: name.slice(0, 40),
      engine: refs.settingEngine.value.trim().slice(0, 20),
      year: refs.settingYear.value.trim().slice(0, 4),
      fuel: refs.settingFuel.value,
    };
    saveState();
    renderVehicle();
    showToast("Auto bylo uloženo");
  });

  refs.themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.theme = button.dataset.themeChoice;
      saveState();
      applyTheme();
    });
  });

  document.querySelector("#exportJson").addEventListener("click", exportBackup);
  document.querySelector("#importJson").addEventListener("click", () => refs.importFile.click());
  refs.importFile.addEventListener("change", importBackup);
  document.querySelector("#exportCsv").addEventListener("click", exportCsv);
  document.querySelector("#eraseData").addEventListener("click", eraseAllEntries);
  if (typeof darkModeListener === "function") darkModeListener();
}

function darkModeListener() {
  const refreshSystemTheme = () => {
    if (state.settings.theme === "system") updateThemeColor();
  };
  if (typeof matchMedia("(prefers-color-scheme: dark)").addEventListener === "function") {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", refreshSystemTheme);
  }
}

function applyTheme() {
  const theme = state.settings.theme || "system";
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
  refs.themeButtons?.forEach((button) => button.setAttribute("aria-checked", String(button.dataset.themeChoice === theme)));
  updateThemeColor();
}

function updateThemeColor() {
  const dark = state.settings.theme === "dark" || (state.settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  meta.content = dark ? "#081016" : "#edf3f7";
}

function toggleQuickTheme() {
  const currentlyDark = document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  state.settings.theme = currentlyDark ? "light" : "dark";
  saveState();
  applyTheme();
}

function renderAll() {
  renderVehicle();
  renderOverview();
  renderHistory();
  renderStats();
  renderSettings();
}

function renderVehicle() {
  refs.vehicleName.textContent = state.vehicle.name;
  const detail = [state.vehicle.engine, state.vehicle.year, state.vehicle.fuel].filter(Boolean).join(" · ");
  refs.vehicleDetail.textContent = detail;
}

function renderOverview() {
  const summary = calculateSummary(state.entries);
  const intervals = calculateIntervals(state.entries);
  const currentMonth = todayIso().slice(0, 7);
  const monthlyEntries = state.entries.filter((entry) => entry.date.startsWith(currentMonth));
  const latest = sortEntries(state.entries).at(-1);

  refs.averageConsumption.textContent = summary.averageConsumption === null ? "—" : numberFormat.format(summary.averageConsumption);
  refs.intervalCount.textContent = intervals.length
    ? `${intervals.length} ${intervals.length === 1 ? "výpočet" : intervals.length < 5 ? "výpočty" : "výpočtů"}`
    : "Zatím bez výpočtu";
  refs.monthSpent.textContent = moneyFormat.format(summary.monthSpent);
  refs.monthRefuels.textContent = formatRefuelCount(monthlyEntries.length);
  refs.averagePrice.textContent = summary.averagePrice === null ? "—" : preciseMoneyFormat.format(summary.averagePrice);
  refs.lastOdometerHint.textContent = latest ? `Naposledy ${integerFormat.format(latest.odometer)} km` : "Přidej první záznam";
  refs.firstTankTip.hidden = intervals.length > 0;
  updateGauge(summary.averageConsumption);

  if (!latest) {
    refs.recentEntry.innerHTML = '<p class="recent-placeholder">Zatím nebylo zapsáno žádné tankování.</p>';
  } else {
    const interval = intervals.find((item) => item.entryId === latest.id);
    refs.recentEntry.innerHTML = createEntryMarkup(latest, interval, true);
  }
}

function updateGauge(consumption) {
  if (consumption === null) {
    refs.gaugeArc.style.strokeDasharray = "0 100";
    refs.gaugeNeedle.style.transform = "rotate(-72deg)";
    return;
  }
  const normalized = Math.max(0, Math.min(1, consumption / 14));
  refs.gaugeArc.style.strokeDasharray = `${round(normalized * 100, 1)} 100`;
  refs.gaugeNeedle.style.transform = `rotate(${-72 + normalized * 144}deg)`;
}

function renderHistory() {
  const summary = calculateSummary(state.entries);
  const intervals = calculateIntervals(state.entries);
  const intervalMap = new Map(intervals.map((interval) => [interval.entryId, interval]));
  const ordered = sortEntries(state.entries).reverse();

  refs.historySpent.textContent = moneyFormat.format(summary.totalSpent);
  refs.historyLiters.textContent = `${numberFormat.format(summary.totalLiters)} l`;
  refs.historyList.innerHTML = ordered.map((entry) => createEntryMarkup(entry, intervalMap.get(entry.id), false)).join("");
  refs.historyList.hidden = ordered.length === 0;
  refs.historyEmpty.hidden = ordered.length !== 0;
}

function createEntryMarkup(entry, interval, compact) {
  const station = entry.station || "Stanice neuvedena";
  const consumption = interval ? `<span class="consumption-chip">${numberFormat.format(interval.consumption)} l / 100 km</span>` : "";
  return `
    <button class="${compact ? "recent-entry" : "entry-item"}" type="button" data-entry-id="${escapeHtml(entry.id)}" aria-label="Upravit tankování ${escapeHtml(formatDate(entry.date))}">
      <span class="fuel-dot"><svg><use href="#i-fuel"></use></svg></span>
      <span class="entry-main">
        <strong>${escapeHtml(formatDate(entry.date))}</strong>
        <span>${integerFormat.format(entry.odometer)} km · ${escapeHtml(station)}${entry.fullTank ? " · plná" : ""}</span>
        ${compact ? "" : consumption}
      </span>
      <span class="entry-amount"><strong>${moneyFormat.format(entry.total)}</strong><span>${numberFormat.format(entry.liters)} l · ${preciseMoneyFormat.format(entry.price)} Kč/l</span></span>
      <svg><use href="#i-chevron"></use></svg>
    </button>`;
}

function renderStats() {
  const summary = calculateSummary(state.entries);
  const intervals = calculateIntervals(state.entries);
  const distance = intervals.reduce((sum, interval) => sum + interval.distance, 0);
  const intervalCost = intervals.reduce((sum, interval) => sum + interval.cost, 0);
  const costKm = distance > 0 ? intervalCost / distance : null;

  refs.statsConsumption.textContent = summary.averageConsumption === null ? "—" : numberFormat.format(summary.averageConsumption);
  refs.statsCostKm.textContent = costKm === null ? "—" : preciseMoneyFormat.format(costKm);
  refs.statsSpent.textContent = moneyFormat.format(summary.totalSpent);
  refs.statsRefuels.textContent = formatRefuelCount(state.entries.length);
  refs.statsDistance.textContent = distance > 0 ? `${integerFormat.format(distance)} km` : "—";
  renderPriceStats();
  renderConsumptionChart(intervals);
  renderCostChart();
}

function renderPriceStats() {
  const ordered = sortEntries(state.entries).filter((entry) => Number(entry.price) > 0);
  const summary = calculatePriceSummary(ordered);
  const stations = calculateStationStats(ordered);

  refs.statsAveragePrice.textContent = summary.average === null ? "—" : preciseMoneyFormat.format(summary.average);
  refs.statsLowestPrice.textContent = summary.lowest === null ? "—" : preciseMoneyFormat.format(summary.lowest);
  refs.statsHighestPrice.textContent = summary.highest === null ? "—" : preciseMoneyFormat.format(summary.highest);
  refs.priceDifference.textContent = ordered.length > 1
    ? `Rozdíl ${preciseMoneyFormat.format(summary.difference)} Kč`
    : ordered.length === 1 ? "První cena" : "Bez dat";

  renderPriceChart(ordered);

  if (!stations.length) {
    refs.stationStats.innerHTML = '<div class="station-empty">Srovnání se zobrazí po prvním tankování.</div>';
    return;
  }

  const cheapest = stations.reduce((best, station) => station.averagePrice < best.averagePrice ? station : best, stations[0]);
  const mostFrequent = stations[0];
  refs.stationStats.innerHTML = stations.map((station) => {
    const badges = [];
    if (stations.length > 1 && station.name === cheapest.name) badges.push('<span class="station-tag is-cheapest">nejlevnější</span>');
    if (stations.length > 1 && station.name === mostFrequent.name) badges.push('<span class="station-tag">nejčastěji</span>');
    return `
      <div class="station-row">
        <span class="station-mark">${escapeHtml(stationInitials(station.name))}</span>
        <span class="station-copy">
          <strong>${escapeHtml(station.name)}</strong>
          <small>${formatRefuelCount(station.count)} · ${numberFormat.format(station.liters)} l</small>
          ${badges.length ? `<span class="station-tags">${badges.join("")}</span>` : ""}
        </span>
        <span class="station-price"><strong>${preciseMoneyFormat.format(station.averagePrice)}</strong><small>Kč / l</small></span>
      </div>`;
  }).join("");
}

function renderPriceChart(entries) {
  if (!entries.length) {
    refs.priceChart.innerHTML = '<div class="chart-empty">Vývoj ceny se zobrazí<br />po prvním tankování.</div>';
    return;
  }

  const values = entries.map((entry) => Number(entry.price));
  const width = 360;
  const height = 180;
  const margin = { top: 12, right: 12, bottom: 29, left: 39 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  let min = Math.min(...values);
  let max = Math.max(...values);
  const padding = Math.max((max - min) * 0.3, 0.5);
  min = Math.max(0, Math.floor((min - padding) * 2) / 2);
  max = Math.ceil((max + padding) * 2) / 2;
  if (max === min) max = min + 1;

  const x = (index) => margin.left + (entries.length === 1 ? plotWidth / 2 : (index / (entries.length - 1)) * plotWidth);
  const y = (value) => margin.top + ((max - value) / (max - min)) * plotHeight;
  const points = entries.map((entry, index) => `${x(index)},${y(entry.price)}`);
  const areaPoints = [`${x(0)},${margin.top + plotHeight}`, ...points, `${x(entries.length - 1)},${margin.top + plotHeight}`].join(" ");
  const grid = Array.from({ length: 4 }, (_, index) => {
    const value = max - ((max - min) / 3) * index;
    const lineY = y(value);
    return `<line class="chart-grid-line" x1="${margin.left}" y1="${lineY}" x2="${width - margin.right}" y2="${lineY}" /><text class="chart-label" x="${margin.left - 6}" y="${lineY + 3}" text-anchor="end">${preciseMoneyFormat.format(value)}</text>`;
  }).join("");
  const dateLabels = labelIndexes(entries.length).map((index) => `<text class="chart-label" x="${x(index)}" y="${height - 7}" text-anchor="middle">${escapeHtml(formatShortDate(entries[index].date))}</text>`).join("");
  const circles = entries.map((entry, index) => `<circle class="price-point" cx="${x(index)}" cy="${y(entry.price)}" r="4" />`).join("");

  refs.priceChart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Vývoj ceny paliva za litr">${grid}<polygon class="price-area" points="${areaPoints}" /><polyline class="price-line" points="${points.join(" ")}" />${circles}${dateLabels}</svg>`;
}

function renderConsumptionChart(intervals) {
  if (!intervals.length) {
    refs.consumptionChart.innerHTML = '<div class="chart-empty">Graf se zobrazí po druhém<br />tankování do plna.</div>';
    refs.consumptionTrend.textContent = "Bez dat";
    refs.consumptionTrend.className = "trend-pill";
    return;
  }

  const values = intervals.map((item) => item.consumption);
  const width = 360;
  const height = 190;
  const margin = { top: 12, right: 12, bottom: 29, left: 36 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  let min = Math.min(...values);
  let max = Math.max(...values);
  const padding = Math.max((max - min) * 0.25, 0.6);
  min = Math.max(0, Math.floor((min - padding) * 2) / 2);
  max = Math.ceil((max + padding) * 2) / 2;
  if (max === min) max = min + 1;

  const x = (index) => margin.left + (intervals.length === 1 ? plotWidth / 2 : (index / (intervals.length - 1)) * plotWidth);
  const y = (value) => margin.top + ((max - value) / (max - min)) * plotHeight;
  const points = intervals.map((item, index) => `${x(index)},${y(item.consumption)}`);
  const areaPoints = [`${x(0)},${margin.top + plotHeight}`, ...points, `${x(intervals.length - 1)},${margin.top + plotHeight}`].join(" ");
  const grid = Array.from({ length: 4 }, (_, index) => {
    const value = max - ((max - min) / 3) * index;
    const lineY = y(value);
    return `<line class="chart-grid-line" x1="${margin.left}" y1="${lineY}" x2="${width - margin.right}" y2="${lineY}" /><text class="chart-label" x="${margin.left - 6}" y="${lineY + 3}" text-anchor="end">${numberFormat.format(value)}</text>`;
  }).join("");
  const dateLabels = labelIndexes(intervals.length).map((index) => `<text class="chart-label" x="${x(index)}" y="${height - 7}" text-anchor="middle">${escapeHtml(formatShortDate(intervals[index].date))}</text>`).join("");
  const circles = intervals.map((item, index) => `<circle class="chart-point" cx="${x(index)}" cy="${y(item.consumption)}" r="4" />`).join("");

  refs.consumptionChart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Vývoj spotřeby v litrech na sto kilometrů">${grid}<polygon class="chart-area" points="${areaPoints}" /><polyline class="chart-line" points="${points.join(" ")}" />${circles}${dateLabels}</svg>`;

  if (values.length < 2) {
    refs.consumptionTrend.textContent = "První výpočet";
    refs.consumptionTrend.className = "trend-pill";
  } else {
    const change = values.at(-1) - values.at(-2);
    refs.consumptionTrend.textContent = `${change <= 0 ? "↓" : "↑"} ${numberFormat.format(Math.abs(change))} l`;
    refs.consumptionTrend.className = `trend-pill ${change <= 0 ? "is-good" : "is-bad"}`;
  }
}

function renderCostChart() {
  const months = lastSixMonths();
  const costs = months.map(({ key, label }) => ({
    key,
    label,
    total: state.entries.filter((entry) => entry.date.startsWith(key)).reduce((sum, entry) => sum + Number(entry.total || 0), 0),
  }));
  const max = Math.max(...costs.map((item) => item.total));
  if (max <= 0) {
    refs.costChart.innerHTML = '<div class="chart-empty">Měsíční náklady se zobrazí<br />po prvním tankování.</div>';
    return;
  }

  const width = 360;
  const height = 190;
  const margin = { top: 15, right: 8, bottom: 29, left: 39 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const step = plotWidth / costs.length;
  const barWidth = Math.min(31, step * 0.62);
  const niceMax = Math.ceil(max / 500) * 500 || 500;
  const grid = Array.from({ length: 4 }, (_, index) => {
    const value = niceMax - (niceMax / 3) * index;
    const lineY = margin.top + (index / 3) * plotHeight;
    return `<line class="chart-grid-line" x1="${margin.left}" y1="${lineY}" x2="${width - margin.right}" y2="${lineY}" /><text class="chart-label" x="${margin.left - 6}" y="${lineY + 3}" text-anchor="end">${compactMoney(value)}</text>`;
  }).join("");
  const bars = costs.map((item, index) => {
    const barHeight = (item.total / niceMax) * plotHeight;
    const barX = margin.left + index * step + (step - barWidth) / 2;
    const barY = margin.top + plotHeight - barHeight;
    return `<rect class="chart-bar" x="${barX}" y="${barY}" width="${barWidth}" height="${Math.max(barHeight, item.total ? 3 : 0)}" rx="7" /><text class="chart-label" x="${barX + barWidth / 2}" y="${height - 7}" text-anchor="middle">${escapeHtml(item.label)}</text>`;
  }).join("");
  refs.costChart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Náklady na tankování za posledních šest měsíců">${grid}${bars}</svg>`;
}

function renderSettings() {
  refs.settingVehicleName.value = state.vehicle.name;
  refs.settingEngine.value = state.vehicle.engine;
  refs.settingYear.value = state.vehicle.year;
  refs.settingFuel.value = state.vehicle.fuel;
  refs.themeButtons.forEach((button) => button.setAttribute("aria-checked", String(button.dataset.themeChoice === state.settings.theme)));
}

function bindConfirmDialog() {
  refs.confirmCancel.addEventListener("click", () => resolveConfirm(false));
  refs.confirmAccept.addEventListener("click", () => resolveConfirm(true));
  refs.confirmDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveConfirm(false);
  });
}

function askConfirm(title, text, actionLabel) {
  if (confirmResolver) resolveConfirm(false);
  refs.confirmTitle.textContent = title;
  refs.confirmText.textContent = text;
  refs.confirmAccept.textContent = actionLabel;
  refs.confirmDialog.showModal();
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function resolveConfirm(value) {
  refs.confirmDialog.close();
  const resolver = confirmResolver;
  confirmResolver = null;
  resolver?.(value);
}

function exportBackup() {
  const payload = { ...state, exportedAt: new Date().toISOString(), app: "Moje tankování" };
  downloadFile(`moje-tankovani-zaloha-${todayIso()}.json`, JSON.stringify(payload, null, 2), "application/json");
  showToast("Záloha byla stažena");
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.entries)) throw new Error("invalid");
    const accepted = await askConfirm("Obnovit zálohu?", `Současná data nahradí ${data.entries.length} záznamů ze zálohy.`, "Obnovit");
    if (!accepted) return;
    state = {
      version: 1,
      vehicle: { ...DEFAULT_STATE.vehicle, ...(data.vehicle || {}) },
      settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) },
      entries: data.entries.map(normalizeEntry).filter(Boolean),
    };
    saveState();
    applyTheme();
    renderAll();
    showView("overview");
    showToast("Záloha byla obnovena");
  } catch {
    showToast("Tento soubor není platná záloha");
  }
}

function exportCsv() {
  const intervals = new Map(calculateIntervals(state.entries).map((item) => [item.entryId, item]));
  const rows = [
    ["Datum", "Tachometr (km)", "Litry", "Cena za litr (Kč)", "Celkem (Kč)", "Plná nádrž", "Spotřeba (l/100 km)", "Stanice", "Poznámka"],
    ...sortEntries(state.entries).map((entry) => [
      entry.date,
      entry.odometer,
      decimalForCsv(entry.liters),
      decimalForCsv(entry.price),
      decimalForCsv(entry.total),
      entry.fullTank ? "Ano" : "Ne",
      intervals.has(entry.id) ? decimalForCsv(intervals.get(entry.id).consumption) : "",
      entry.station,
      entry.note,
    ]),
  ];

  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  downloadFile(`tankovani-${todayIso()}.csv`, csv, "text/csv;charset=utf-8");
  showToast("CSV bylo staženo");
}

async function eraseAllEntries() {
  if (!state.entries.length) {
    showToast("Není co mazat");
    return;
  }
  const accepted = await askConfirm("Smazat všechna tankování?", `Trvale odstraníš ${state.entries.length} záznamů. Nastavení auta zůstane zachované.`, "Smazat vše");
  if (!accepted) return;
  state.entries = [];
  saveState();
  renderAll();
  showView("overview");
  showToast("Všechna tankování byla smazána");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  refs.toast.textContent = message;
  refs.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => refs.toast.classList.remove("is-visible"), 2300);
}

function lastSixMonths() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1, 12);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("cs-CZ", { month: "short" }).format(date).replace(".", ""),
    };
  });
}

function labelIndexes(length) {
  if (length <= 1) return [0];
  if (length === 2) return [0, 1];
  return [...new Set([0, Math.floor((length - 1) / 2), length - 1])];
}

function compactMoney(value) {
  if (value >= 1000) return `${numberFormat.format(value / 1000)}k`;
  return integerFormat.format(value);
}

function stationInitials(name) {
  const known = {
    "tank ono": "TO",
    "km-prona": "KM",
    eurooil: "EO",
    neuvedeno: "?",
  };
  const key = String(name).toLocaleLowerCase("cs-CZ");
  if (known[key]) return known[key];
  const words = String(name).match(/[\p{L}\p{N}]+/gu) || [];
  if (words.length > 1) return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return String(name).slice(0, 2).toUpperCase();
}

function formatRefuelCount(count) {
  return `${count} tankování`;
}

function formatDate(isoDate) {
  return dateFormat.format(new Date(`${isoDate}T12:00:00`));
}

function formatShortDate(isoDate) {
  return shortDateFormat.format(new Date(`${isoDate}T12:00:00`));
}

function formatInput(value, places = 2) {
  return new Intl.NumberFormat("cs-CZ", {
    useGrouping: false,
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  }).format(round(Number(value), places));
}

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function makeId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function decimalForCsv(value) {
  return String(round(Number(value), 3)).replace(".", ",");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
