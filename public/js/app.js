"use strict";

// ═══════════════════════════════════════════════
//  QuizAI — Frontend App
// ═══════════════════════════════════════════════

const El = (id) => document.getElementById(id);

const DOM = {
  video:         El("video"),
  canvas:        El("canvas"),
  overlay:       El("overlay"),
  scanLine:      El("scan-line"),
  scanBox:       El("scan-box"),
  statusDot:     El("status-dot"),
  statusText:    El("status-text"),
  diffFill:      El("diff-fill"),
  diffLabel:     El("diff-label"),
  zoomLabel:     El("zoom-label"),
  cooldownBar:   El("cooldown-bar"),
  cooldownFill:  El("cooldown-fill"),
  manualBtn:     El("manual-btn"),
  noCam:         El("no-cam"),
  startCamBtn:   El("start-cam-btn"),
  settingsPanel: El("settings-panel"),
  settingsBtn:   El("settings-btn"),
  settingsClose: El("settings-close"),
  answerBox:     El("answer-box"),
  answerText:    El("answer-text"),
  answerTime:    El("answer-time"),
  modeText:      El("mode-text"),
  autoToggle:    El("auto-toggle"),
  autoSwitch:    El("auto-switch"),
  sCam:          El("s-cam"),
};

// ─── State ──────────────────────────────────────
const state = {
  stream:       null,
  autoMode:     false,
  autoTimer:    null,
  inCooldown:   false,
  isSending:    false,
  lastThumb:    null,
  cooldownTimer: null,

  cfg: {
    interval:      3,
    diffThreshold: 6,
    cooldown:      4,
    zoom:          1.0,
    quality:       0.6,
  },
};

const ctx = DOM.canvas.getContext("2d", { willReadFrequently: true });

// ─── Status helpers ──────────────────────────────
function setStatus(text, color) {
  DOM.statusText.textContent = text;
  DOM.statusText.style.color = color || "var(--green)";
  DOM.statusDot.className = "";
  if (color === "var(--red)")   DOM.statusDot.className = "red";
  else if (color === "var(--amber)") DOM.statusDot.className = "amber";
  else DOM.statusDot.className = "green";
}

function setAnswer(text, stateVal) {
  DOM.answerText.textContent = text;
  DOM.answerText.dataset.state = stateVal || "answer";
  DOM.answerBox.className = stateVal || "";
}

function setAnswerTime(ms) {
  if (ms) DOM.answerTime.textContent = `${(ms / 1000).toFixed(1)}s`;
  else DOM.answerTime.textContent = "";
}

// ─── Camera ─────────────────────────────────────
async function startCamera(deviceId) {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }

  const constraints = {
    video: deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  };

  try {
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    DOM.video.srcObject = state.stream;
    DOM.noCam.style.display = "none";
    setStatus("READY");
    await populateCameras();
  } catch (err) {
    console.error("Camera error:", err);
    setStatus("CAM ERROR", "var(--red)");
    DOM.noCam.style.display = "flex";
  }
}

async function populateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    DOM.sCam.innerHTML = "";
    cams.forEach((cam, i) => {
      const opt = document.createElement("option");
      opt.value = cam.deviceId;
      opt.textContent = cam.label || `Camera ${i + 1}`;
      DOM.sCam.appendChild(opt);
    });
  } catch (_) {}
}

// ─── Frame Capture ───────────────────────────────
function captureThumb(size = 64) {
  if (!state.stream || DOM.video.readyState < 2) return null;

  DOM.canvas.width = size;
  DOM.canvas.height = size;

  const vw = DOM.video.videoWidth  || 640;
  const vh = DOM.video.videoHeight || 480;

  // Crop to center 80% to match the scan box roughly
  const pad = 0.1;
  const sx = vw * pad;
  const sy = vh * pad;
  const sw = vw * (1 - 2 * pad);
  const sh = vh * (1 - 2 * pad);

  ctx.drawImage(DOM.video, sx, sy, sw, sh, 0, 0, size, size);

  // Convert to grayscale for better diffing
  const imgData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const gray = 0.299 * imgData.data[i] + 0.587 * imgData.data[i+1] + 0.114 * imgData.data[i+2];
    imgData.data[i] = imgData.data[i+1] = imgData.data[i+2] = gray;
  }

  return imgData;
}

function captureBase64() {
  if (!state.stream || DOM.video.readyState < 2) return null;

  const vw = DOM.video.videoWidth  || 640;
  const vh = DOM.video.videoHeight || 480;

  DOM.canvas.width  = vw;
  DOM.canvas.height = vh;

  ctx.drawImage(DOM.video, 0, 0, vw, vh);
  return DOM.canvas.toDataURL("image/jpeg", state.cfg.quality).split(",")[1];
}

// ─── Pixel Diff ──────────────────────────────────
function pixelDiff(a, b) {
  if (!a || !b || a.data.length !== b.data.length) return 100;

  let total = 0;
  const len = a.data.length;

  for (let i = 0; i < len; i += 4) {
    total += Math.abs(a.data[i] - b.data[i]); // grayscale — all channels same
  }

  // Normalize to 0–100
  return (total / (len / 4)) / 255 * 100;
}

// ─── AI Call ─────────────────────────────────────
async function sendToAI(base64) {
  const start = Date.now();

  setStatus("THINKING...", "var(--amber)");
  setAnswer("Analyzing question...", "thinking");
  setAnswerTime(null);
  DOM.scanLine.classList.add("scanning");

  try {
    const res = await fetch("/api/analyze", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ image: base64 }),
    });

    const data = await res.json();

    if (!res.ok) {
      setAnswer(data.error || "Server error", "error");
      setStatus("ERROR", "var(--red)");
      return;
    }

    const elapsed = Date.now() - start;
    setAnswer(data.answer, "answer");
    setAnswerTime(elapsed);
    setStatus("ANSWERED ✓");
    startCooldown();

  } catch (err) {
    console.error("Fetch error:", err);
    setAnswer("Network error — is server running?", "error");
    setStatus("ERROR", "var(--red)");
  } finally {
    state.isSending = false;
    DOM.scanLine.classList.remove("scanning");
  }
}

// ─── Cooldown ────────────────────────────────────
function startCooldown() {
  state.inCooldown = true;
  DOM.cooldownBar.style.display = "block";

  const dur = state.cfg.cooldown * 1000;

  DOM.cooldownFill.style.transition = "none";
  DOM.cooldownFill.style.transform  = "scaleX(1)";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      DOM.cooldownFill.style.transition = `transform ${dur}ms linear`;
      DOM.cooldownFill.style.transform  = "scaleX(0)";
    });
  });

  clearTimeout(state.cooldownTimer);
  state.cooldownTimer = setTimeout(() => {
    state.inCooldown = false;
    DOM.cooldownBar.style.display = "none";
    if (state.autoMode) {
      setStatus("SCANNING", "var(--green)");
    } else {
      setStatus("READY");
    }
  }, dur);
}

// ─── Main Check & Send Logic ──────────────────────
async function checkAndSend(force = false) {
  if (state.isSending)  return;
  if (state.inCooldown && !force) return;
  if (!state.stream || DOM.video.readyState < 2) {
    setStatus("NO CAMERA", "var(--red)");
    return;
  }

  const thumb = captureThumb(64);
  const diff  = pixelDiff(state.lastThumb, thumb);
  const pct   = Math.min(100, Math.round(diff * 10) / 10);

  // Update diff bar
  DOM.diffFill.style.width = Math.min(100, pct * 3) + "%";
  DOM.diffLabel.textContent = pct.toFixed(1) + "%";

  if (diff > state.cfg.diffThreshold) {
    DOM.diffFill.className = "high";
  } else {
    DOM.diffFill.className = "low";
  }

  // Skip if same screen (unless forced)
  if (!force && state.lastThumb && diff < state.cfg.diffThreshold) {
    setStatus("SAME SCREEN");
    return;
  }

  state.lastThumb = thumb;
  state.isSending = true;

  // Flash button
  DOM.manualBtn.classList.add("firing");
  setTimeout(() => DOM.manualBtn.classList.remove("firing"), 400);

  const base64 = captureBase64();
  if (base64) {
    await sendToAI(base64);
  } else {
    state.isSending = false;
  }
}

// ─── Auto Mode ───────────────────────────────────
function startAutoMode() {
  state.autoMode = true;
  DOM.autoSwitch.classList.add("on");
  DOM.modeText.textContent = `Auto • ${state.cfg.interval}s`;
  setStatus("SCANNING");
  DOM.scanLine.classList.add("scanning");

  clearInterval(state.autoTimer);
  state.autoTimer = setInterval(() => checkAndSend(false), state.cfg.interval * 1000);
}

function stopAutoMode() {
  state.autoMode = false;
  DOM.autoSwitch.classList.remove("on");
  DOM.modeText.textContent = "Manual";
  DOM.scanLine.classList.remove("scanning");

  clearInterval(state.autoTimer);
  state.autoTimer = null;

  if (!state.isSending) setStatus("READY");
}

function toggleAuto() {
  if (state.autoMode) stopAutoMode();
  else startAutoMode();
}

// ─── Settings ────────────────────────────────────
function bindSlider(sliderId, valId, cfgKey, transform, displayFn) {
  const slider = El(sliderId);
  const valEl  = El(valId);

  slider.addEventListener("input", () => {
    const raw = parseFloat(slider.value);
    const val = transform ? transform(raw) : raw;
    state.cfg[cfgKey] = val;
    valEl.textContent = displayFn ? displayFn(val) : String(val);
    onSettingChange(cfgKey);
  });
}

function onSettingChange(key) {
  if (key === "interval" && state.autoMode) {
    clearInterval(state.autoTimer);
    state.autoTimer = setInterval(() => checkAndSend(false), state.cfg.interval * 1000);
    DOM.modeText.textContent = `Auto • ${state.cfg.interval}s`;
  }

  if (key === "zoom") {
    DOM.video.style.transform       = `scale(${state.cfg.zoom})`;
    DOM.video.style.transformOrigin = "center center";
    DOM.zoomLabel.textContent       = state.cfg.zoom.toFixed(1) + "×";
  }
}

// ─── Event Listeners ─────────────────────────────

// Manual capture button
DOM.manualBtn.addEventListener("click", () => {
  if (!state.stream) { startCamera(); return; }
  if (!state.isSending) checkAndSend(true);
});

// Auto toggle
DOM.autoToggle.addEventListener("click", () => {
  if (!state.stream) { alert("Enable camera first"); return; }
  toggleAuto();
});
DOM.autoToggle.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") toggleAuto();
});

// Start camera button (no-cam state)
DOM.startCamBtn.addEventListener("click", () => startCamera());

// Settings panel
DOM.settingsBtn.addEventListener("click", () => {
  DOM.settingsPanel.classList.toggle("open");
});

DOM.settingsClose.addEventListener("click", () => {
  DOM.settingsPanel.classList.remove("open");
});

// Camera selector
DOM.sCam.addEventListener("change", () => {
  const deviceId = DOM.sCam.value;
  if (deviceId) startCamera(deviceId);
});

// Close settings if tapping outside
document.addEventListener("click", (e) => {
  if (
    DOM.settingsPanel.classList.contains("open") &&
    !DOM.settingsPanel.contains(e.target) &&
    e.target !== DOM.settingsBtn &&
    !DOM.settingsBtn.contains(e.target)
  ) {
    DOM.settingsPanel.classList.remove("open");
  }
});

// ─── Slider bindings ─────────────────────────────
bindSlider("s-interval", "s-interval-val", "interval",
  (v) => v,
  (v) => `${v}s`
);

bindSlider("s-diff", "s-diff-val", "diffThreshold",
  (v) => v,
  (v) => `${v}%`
);

bindSlider("s-cooldown", "s-cooldown-val", "cooldown",
  (v) => v,
  (v) => `${v}s`
);

bindSlider("s-zoom", "s-zoom-val", "zoom",
  (v) => parseFloat((v / 10).toFixed(1)),
  (v) => `${v.toFixed(1)}×`
);

bindSlider("s-quality", "s-quality-val", "quality",
  (v) => parseFloat((v / 10).toFixed(1)),
  (v) => v.toFixed(1)
);

// ─── Health Check ────────────────────────────────
async function checkHealth() {
  try {
    const res  = await fetch("/api/health");
    const data = await res.json();
    if (!data.apiKeySet) {
      setAnswer("⚠ API key not set in .env file", "error");
      console.warn("ANTHROPIC_API_KEY is not configured in .env");
    }
  } catch (_) {
    console.warn("Could not reach server health check");
  }
}

// ─── Init ────────────────────────────────────────
(async function init() {
  setStatus("IDLE");
  setAnswer("Waiting for question...", "idle");

  // Check API key
  await checkHealth();

  // Try to start camera automatically
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    await startCamera();
  } else {
    setStatus("NOT SUPPORTED", "var(--red)");
    DOM.noCam.style.display = "flex";
    setAnswer("Camera API not supported in this browser", "error");
  }
})();
