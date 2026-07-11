// ==========================================================================
// gatekeeper.js
// Drives the sequential 10-screen password gate. Nothing here persists
// across a refresh (state lives only in memory), so reloading the page
// always restarts at stage 1, satisfying the "clear session on refresh"
// requirement automatically.
// ==========================================================================

import { STAGES, TOTAL_STAGES, MAX_ATTEMPTS, LOCKOUT_SECONDS, INACTIVITY_MS } from "./passwords.js";

const screenStack = document.getElementById("screenStack");
const progressBar = document.getElementById("progressBar");
const progressLabel = document.getElementById("progressLabel");
const gate = document.getElementById("gate");
const authGate = document.getElementById("authGate");
const lockoutEl = document.getElementById("lockout");
const lockoutTimerEl = document.getElementById("lockoutTimer");

let currentIndex = 0;      // 0-based index into STAGES
let attempts = 0;          // wrong attempts on the current stage
let lockedUntil = 0;       // epoch ms
let inactivityTimer = null;

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    // Too long idle mid-sequence: snap back to the start.
    currentIndex = 0;
    attempts = 0;
    renderStage();
  }, INACTIVITY_MS);
}

["pointerdown", "keydown", "touchstart"].forEach((evt) =>
  document.addEventListener(evt, resetInactivityTimer, { passive: true })
);

function updateProgress() {
  const pct = Math.round((currentIndex / TOTAL_STAGES) * 100);
  progressBar.style.setProperty("--pct", `${pct}%`);
  progressLabel.textContent = `STAGE ${String(currentIndex + 1).padStart(2, "0")} / ${TOTAL_STAGES}`;
}

function isLocked() {
  return Date.now() < lockedUntil;
}

function startLockout() {
  lockedUntil = Date.now() + LOCKOUT_SECONDS * 1000;
  gate.querySelector(".screen-stack").hidden = true;
  lockoutEl.hidden = false;
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
    lockoutTimerEl.textContent = `Locked for ${remaining}s`;
    if (remaining <= 0) {
      lockoutEl.hidden = true;
      gate.querySelector(".screen-stack").hidden = false;
      attempts = 0;
      renderStage();
    } else {
      setTimeout(tick, 250);
    }
  };
  tick();
}

function renderStage() {
  if (currentIndex >= TOTAL_STAGES) {
    completeGate();
    return;
  }
  updateProgress();
  const stage = STAGES[currentIndex];
  screenStack.innerHTML = "";
  const el = stage.type === "numeric" ? buildNumericScreen(stage) : buildTextScreen(stage);
  el.classList.add("pw-screen", "glass");
  el.setAttribute("data-anim", stage.anim);
  screenStack.appendChild(el);
}

function buildNumericScreen(stage) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="pw-screen__eyebrow">ACCESS CONTROL</div>
    <h2 class="pw-screen__title">${stage.title}</h2>
    <p class="pw-screen__hint">${stage.hint}</p>
    <div class="pw-dots" id="pwDots">
      ${Array.from({ length: 6 }).map(() => "<span></span>").join("")}
    </div>
    <input class="pw-numeric" id="pwNumeric" type="tel" inputmode="numeric"
           pattern="[0-9]*" maxlength="6" autocomplete="off"
           autocorrect="off" spellcheck="false" />
    <div class="keypad" id="keypad">
      ${[1,2,3,4,5,6,7,8,9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join("")}
      <button type="button" class="key-empty"></button>
      <button type="button" data-k="0">0</button>
      <button type="button" class="key-del" data-k="del">DEL</button>
    </div>
  `;

  const hiddenInput = wrap.querySelector("#pwNumeric");
  const dots = wrap.querySelectorAll("#pwDots span");
  const keypad = wrap.querySelector("#keypad");

  // Block paste/copy/cut and autofill on the real input, even though it's
  // visually hidden in favor of the on-screen keypad (keeps physical
  // keyboards usable too).
  ["paste", "copy", "cut"].forEach((evt) =>
    hiddenInput.addEventListener(evt, (e) => e.preventDefault())
  );
  hiddenInput.addEventListener("input", () => {
    hiddenInput.value = hiddenInput.value.replace(/\D/g, "").slice(0, 6);
    syncDots();
    if (hiddenInput.value.length === 6) attemptSubmit(hiddenInput.value, wrap);
  });

  function syncDots() {
    dots.forEach((d, i) => d.classList.toggle("filled", i < hiddenInput.value.length));
  }

  keypad.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-k]");
    if (!btn || isLocked()) return;
    btn.classList.add("tapped");
    setTimeout(() => btn.classList.remove("tapped"), 150);
    const k = btn.dataset.k;
    if (k === "del") {
      hiddenInput.value = hiddenInput.value.slice(0, -1);
    } else if (hiddenInput.value.length < 6) {
      hiddenInput.value += k;
    }
    syncDots();
    if (hiddenInput.value.length === 6) attemptSubmit(hiddenInput.value, wrap);
  });

  // Auto-focus the hidden input so a physical/mobile numeric keyboard works too.
  setTimeout(() => hiddenInput.focus(), 50);

  return wrap;
}

function buildTextScreen(stage) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="pw-screen__eyebrow">ACCESS CONTROL</div>
    <h2 class="pw-screen__title">${stage.title}</h2>
    <p class="pw-screen__hint">${stage.hint}</p>
    <form id="textForm" autocomplete="off">
      <div class="pw-text-wrap">
        <input class="pw-text" id="pwText" type="password" autocomplete="new-password"
               autocorrect="off" spellcheck="false" required />
        <button type="button" class="pw-text-toggle" id="pwToggle">SHOW</button>
      </div>
      <button type="submit" class="btn-primary"><span>Unlock</span></button>
    </form>
  `;

  const input = wrap.querySelector("#pwText");
  const toggle = wrap.querySelector("#pwToggle");
  const form = wrap.querySelector("#textForm");

  ["paste", "copy", "cut"].forEach((evt) => input.addEventListener(evt, (e) => e.preventDefault()));
  toggle.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.textContent = show ? "HIDE" : "SHOW";
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (isLocked()) return;
    attemptSubmit(input.value, wrap);
  });

  setTimeout(() => input.focus(), 50);
  return wrap;
}

function attemptSubmit(value, screenEl) {
  const stage = STAGES[currentIndex];
  const correct = value === stage.answer;

  if (correct) {
    screenEl.classList.add("state-correct");
    setTimeout(() => {
      currentIndex += 1;
      attempts = 0;
      renderStage();
    }, 380);
  } else {
    attempts += 1;
    screenEl.classList.add("state-wrong");
    navigator.vibrate?.(120);
    setTimeout(() => screenEl.classList.remove("state-wrong"), 460);

    // Clear the field so nothing lingers, then re-check for lockout.
    const numeric = screenEl.querySelector("#pwNumeric");
    const text = screenEl.querySelector("#pwText");
    if (numeric) { numeric.value = ""; screenEl.querySelectorAll(".pw-dots span").forEach(d => d.classList.remove("filled")); }
    if (text) text.value = "";

    if (attempts >= MAX_ATTEMPTS) {
      setTimeout(startLockout, 200);
    }
  }
}

function completeGate() {
  gate.hidden = true;
  authGate.hidden = false;
}

// Kick things off.
renderStage();
resetInactivityTimer();
