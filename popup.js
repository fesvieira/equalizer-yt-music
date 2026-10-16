const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const BAND_LABELS = ["32", "64", "125", "250", "500", "1K", "2K", "4K", "8K", "16K"];
const MIN_DB = -12;
const MAX_DB = 12;

const PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Bass: [8, 8, 6, 3, 0, -1, 0, 1, 2, 2],
  Treble: [0, 0, 0, 0, 0, 2, 4, 6, 7, 8],
  "V-Shape": [6, 5, 3, 0, -2, -2, 0, 3, 5, 6],
  Vocal: [-2, -1, 0, 2, 4, 4, 3, 1, -1, -2],
  Rock: [5, 4, 2, 0, -1, -1, 0, 3, 4, 5],
  Electronic: [6, 5, 1, 0, -2, 1, 0, 2, 4, 5],
  Jazz: [3, 2, 0, 2, -1, -1, 0, 1, 2, 3],
};

let gains = [8, 8, 6, 3, 0, -1, 0, 1, 2, 2];
let preamp = 0;
let eqEnabled = true;
let activePreset = "Bass";

function formatDb(val) {
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(1)}`;
}

function buildEqGrid() {
  const grid = document.getElementById("eq-grid");
  const labels = document.getElementById("freq-labels");

  BANDS.forEach((_, i) => {
    const band = document.createElement("div");
    band.className = "band";

    const valueEl = document.createElement("div");
    valueEl.className = "band-value";
    valueEl.id = `band-val-${i}`;
    valueEl.textContent = "0.0";

    const wrap = document.createElement("div");
    wrap.className = "band-slider-wrap";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "eq-slider";
    slider.id = `eq-slider-${i}`;
    slider.min = MIN_DB;
    slider.max = MAX_DB;
    slider.step = 0.5;
    slider.value = 0;

    slider.addEventListener("input", () => {
      gains[i] = parseFloat(slider.value);
      updateBandValue(i);
      activePreset = null;
      updatePresetButtons();
      sendToContent();
      drawCurve();
      chrome.storage.local.set({ gains });
    });

    wrap.appendChild(slider);
    band.appendChild(valueEl);
    band.appendChild(wrap);
    grid.appendChild(band);

    const label = document.createElement("div");
    label.className = "freq-label";
    label.textContent = BAND_LABELS[i];
    labels.appendChild(label);
  });
}

function buildPresets() {
  const list = document.getElementById("presets-list");
  Object.keys(PRESETS).forEach((name) => {
    const btn = document.createElement("button");
    btn.className = "preset-btn" + (name === activePreset ? " active" : "");
    btn.textContent = name;
    btn.dataset.preset = name;
    btn.addEventListener("click", () => applyPreset(name));
    list.appendChild(btn);
  });
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  gains = [...preset];
  activePreset = name;
  updateAllSliders();
  updatePresetButtons();
  sendToContent();
  drawCurve();
}

function updatePresetButtons() {
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === activePreset);
  });
}

function updateBandValue(i) {
  const el = document.getElementById(`band-val-${i}`);
  if (!el) return;
  const val = gains[i];
  el.textContent = formatDb(val);
  el.classList.toggle("active", val !== 0);
}

function updateAllSliders() {
  gains.forEach((g, i) => {
    const slider = document.getElementById(`eq-slider-${i}`);
    if (slider) slider.value = g;
    updateBandValue(i);
  });
  const preampSlider = document.getElementById("preamp");
  const preampVal = document.getElementById("preamp-value");
  if (preampSlider) preampSlider.value = preamp;
  if (preampVal) preampVal.textContent = `${formatDb(preamp)} dB`;
}

function sendToContent() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, {
      type: "SET_GAINS",
      gains,
      preamp,
      enabled: eqEnabled,
    }).catch(() => {});
  });
}

function drawCurve() {
  const canvas = document.getElementById("eq-curve");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  const freqMin = Math.log10(20);
  const freqMax = Math.log10(22000);

  function freqToX(f) {
    return ((Math.log10(f) - freqMin) / (freqMax - freqMin)) * W;
  }

  function gainToY(g) {
    return H / 2 - (g / MAX_DB) * (H / 2 - 8);
  }

  const points = [];
  const steps = 200;
  for (let s = 0; s <= steps; s++) {
    const f = Math.pow(10, freqMin + (s / steps) * (freqMax - freqMin));
    let totalGain = 0;
    BANDS.forEach((bandFreq, i) => {
      const gain = eqEnabled ? gains[i] : 0;
      if (gain === 0) return;
      const ratio = f / bandFreq;
      const logRatio = Math.log2(ratio);
      const Q = 1.4;
      const sigma = 1 / Q;
      totalGain += gain * Math.exp(-(logRatio * logRatio) / (2 * sigma * sigma));
    });
    points.push({ x: freqToX(f), y: gainToY(totalGain) });
  }

  const gradient = ctx.createLinearGradient(0, 0, W, 0);
  gradient.addColorStop(0, "#a855f7");
  gradient.addColorStop(1, "#06b6d4");

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

  const fillGradient = ctx.createLinearGradient(0, 0, 0, H);
  fillGradient.addColorStop(0, "rgba(168, 85, 247, 0.3)");
  fillGradient.addColorStop(0.5, "rgba(6, 182, 212, 0.1)");
  fillGradient.addColorStop(1, "rgba(6, 182, 212, 0)");

  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = fillGradient;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.shadowColor = "#a855f7";
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function init() {
  buildEqGrid();
  buildPresets();

  chrome.storage.local.get(["gains", "preamp", "enabled"], (result) => {
    if (result.gains) gains = result.gains;
    if (result.preamp !== undefined) preamp = result.preamp;
    if (result.enabled !== undefined) eqEnabled = result.enabled;

    const toggle = document.getElementById("eq-toggle");
    toggle.checked = eqEnabled;
    updateToggleUI();
    updateAllSliders();
    drawCurve();
  });

  document.getElementById("eq-toggle").addEventListener("change", (e) => {
    eqEnabled = e.target.checked;
    updateToggleUI();
    sendToContent();
    drawCurve();
    chrome.storage.local.set({ enabled: eqEnabled });
  });

  document.getElementById("preamp").addEventListener("input", (e) => {
    preamp = parseFloat(e.target.value);
    document.getElementById("preamp-value").textContent = `${formatDb(preamp)} dB`;
    sendToContent();
    chrome.storage.local.set({ preamp });
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    gains = new Array(BANDS.length).fill(0);
    preamp = 0;
    activePreset = "Flat";
    updateAllSliders();
    updatePresetButtons();
    sendToContent();
    drawCurve();
    chrome.storage.local.set({ gains, preamp });
  });

}

function updateToggleUI() {
  const label = document.getElementById("toggle-status");
  const eqSection = document.getElementById("eq-grid").parentElement;
  const preampSection = document.querySelector(".preamp-section");
  const curveContainer = document.querySelector(".curve-container");

  label.textContent = eqEnabled ? "ON" : "OFF";
  label.style.color = eqEnabled ? "#a855f7" : "";

  [eqSection, preampSection, curveContainer].forEach((el) => {
    el.classList.toggle("disabled-overlay", !eqEnabled);
  });
}

init();
