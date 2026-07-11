// ==========================================================================
// app.js — everything in one file on purpose: fewer moving parts, fewer
// places a relative-import typo can break the page on a static host.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- Supabase project (from your krncyrxbwyazomhnuyfu project) -----------
// The anon key is not a secret — it's meant to sit in client code. Real
// protection comes from the Row Level Security policies on the `photos`
// table and the `vault-photos` storage bucket, both already set up.
const SUPABASE_URL = "https://krncyrxbwyazomhnuyfu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtybmN5cnhid3lhem9taG51eWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzg3NjEsImV4cCI6MjA5MTc1NDc2MX0.6s-vfyeCm4gsZ9K4wKISwUACVs6sXNzUFBKWwtAvHn0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET = "vault-photos";

// ---- The 10 gate stages ---------------------------------------------------
const TRANSITIONS = ["fade", "slide", "scale", "blur"];
const STAGES = [
  { type: "numeric", answer: "123456" },
  { type: "numeric", answer: "789123" },
  { type: "numeric", answer: "456789" },
  { type: "numeric", answer: "123456" },
  { type: "numeric", answer: "789123" },
  { type: "numeric", answer: "456789" },
  { type: "numeric", answer: "123456" },
  { type: "text", answer: "Tr0ub4dor&3" },
  { type: "text", answer: "N3on$Vault!99" },
  { type: "text", answer: "X7#nova_2026*Zq" },
].map((s, i) => ({ ...s, t: TRANSITIONS[i % TRANSITIONS.length] }));

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;
const INACTIVITY_MS = 3 * 60 * 1000;

// ---- Element refs ----------------------------------------------------------
const gate = document.getElementById("gate");
const screenHost = document.getElementById("screenHost");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const lockoutEl = document.getElementById("lockout");
const lockoutTimerEl = document.getElementById("lockoutTimer");
const opening = document.getElementById("opening");
const vaultEl = document.getElementById("vault");
const grid = document.getElementById("grid");
const empty = document.getElementById("empty");
const uploadInput = document.getElementById("uploadInput");
const uploadBar = document.getElementById("uploadBar");
const uploadBarFill = document.getElementById("uploadBarFill");
const viewer = document.getElementById("viewer");
const viewerImg = document.getElementById("viewerImg");
const viewerClose = document.getElementById("viewerClose");
const viewerDelete = document.getElementById("viewerDelete");
const viewerPrev = document.getElementById("viewerPrev");
const viewerNext = document.getElementById("viewerNext");

// ---- Gate state --------------------------------------------------------
let stageIndex = 0;
let attempts = 0;
let lockedUntil = 0;
let idleTimer = null;

function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { stageIndex = 0; attempts = 0; renderStage(); }, INACTIVITY_MS);
}
["pointerdown", "keydown", "touchstart"].forEach((evt) =>
  document.addEventListener(evt, resetIdle, { passive: true })
);

function isLocked() { return Date.now() < lockedUntil; }

function startLockout() {
  lockedUntil = Date.now() + LOCKOUT_SECONDS * 1000;
  screenHost.hidden = true;
  lockoutEl.hidden = false;
  const tick = () => {
    const left = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
    lockoutTimerEl.textContent = `${left}s remaining`;
    if (left <= 0) {
      lockoutEl.hidden = true;
      screenHost.hidden = false;
      attempts = 0;
      renderStage();
    } else {
      setTimeout(tick, 250);
    }
  };
  tick();
}

function renderStage() {
  if (stageIndex >= STAGES.length) { onGateComplete(); return; }
  activeAddDigit = null;
  activeDelDigit = null;
  activeResetDigits = null;
  progressFill.style.width = `${Math.round((stageIndex / STAGES.length) * 100)}%`;
  progressLabel.textContent = `Stage ${stageIndex + 1} / ${STAGES.length}`;

  const stage = STAGES[stageIndex];
  screenHost.innerHTML = "";
  const card = stage.type === "numeric" ? buildNumeric(stage) : buildText(stage);
  card.classList.add("card");
  card.setAttribute("data-t", stage.t);
  screenHost.appendChild(card);
}

let activeAddDigit = null;
let activeDelDigit = null;
let activeResetDigits = null;

document.addEventListener("keydown", (e) => {
  if (!activeAddDigit) return;
  if (/^[0-9]$/.test(e.key)) activeAddDigit(e.key);
  else if (e.key === "Backspace") activeDelDigit();
});

function buildNumeric(stage) {
  let buffer = "";
  const card = document.createElement("div");
  card.innerHTML = `
    <h2 class="card__title">Stage ${stageIndex + 1}</h2>
    <p class="card__hint">Enter the 6-digit code</p>
    <div class="dots" id="dots">${"<span></span>".repeat(6)}</div>
    <div class="keypad" id="keypad">
      ${[1,2,3,4,5,6,7,8,9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join("")}
      <button type="button" class="key-empty"></button>
      <button type="button" data-k="0">0</button>
      <button type="button" class="key-del" data-k="del">DEL</button>
    </div>
  `;
  const dots = card.querySelectorAll("#dots span");
  const keypad = card.querySelector("#keypad");
  let prevLength = 0;

  function sync() {
    dots.forEach((d, i) => d.classList.toggle("filled", i < buffer.length));
    if (buffer.length > prevLength) {
      const dot = dots[buffer.length - 1];
      dot.classList.remove("pop");
      void dot.offsetWidth; // restart animation if it's mid-play
      dot.classList.add("pop");
    }
    prevLength = buffer.length;
  }

  function addDigit(d) {
    if (isLocked() || buffer.length >= 6) return;
    buffer += d;
    sync();
    if (buffer.length === 6) submit(buffer, card);
  }
  function delDigit() {
    buffer = buffer.slice(0, -1);
    sync();
  }

  function reset() { buffer = ""; prevLength = 0; sync(); }

  function spawnRipple(btn, clientX, clientY) {
    const rect = btn.getBoundingClientRect();
    const hasCoords = clientX || clientY;
    const x = hasCoords ? clientX - rect.left : rect.width / 2;
    const y = hasCoords ? clientY - rect.top : rect.height / 2;
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  }

  keypad.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-k]");
    if (!btn || isLocked()) return;
    spawnRipple(btn, e.clientX, e.clientY);
    btn.classList.add("tap");
    setTimeout(() => btn.classList.remove("tap"), 380);
    if (btn.dataset.k === "del") delDigit();
    else addDigit(btn.dataset.k);
  });

  activeAddDigit = addDigit;
  activeDelDigit = delDigit;
  activeResetDigits = reset;

  return card;
}

function buildText(stage) {
  const card = document.createElement("div");
  card.innerHTML = `
    <h2 class="card__title">Stage ${stageIndex + 1}</h2>
    <p class="card__hint">Case-sensitive passphrase</p>
    <form id="form" autocomplete="off">
      <div class="text-input-wrap">
        <input class="text-input" id="txt" type="password" autocomplete="new-password"
               autocorrect="off" spellcheck="false" required />
        <button type="button" class="text-toggle" id="toggle">SHOW</button>
      </div>
      <button type="submit" class="btn">Unlock</button>
    </form>
  `;
  const input = card.querySelector("#txt");
  const toggle = card.querySelector("#toggle");
  const form = card.querySelector("#form");

  ["paste", "copy", "cut"].forEach((evt) => input.addEventListener(evt, (e) => e.preventDefault()));
  toggle.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.textContent = show ? "HIDE" : "SHOW";
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (isLocked()) return;
    submit(input.value, card);
  });

  setTimeout(() => input.focus(), 30);
  return card;
}

function submit(value, card) {
  const correct = value === STAGES[stageIndex].answer;
  if (correct) {
    card.classList.add("correct");
    setTimeout(() => { stageIndex++; attempts = 0; renderStage(); }, 300);
  } else {
    attempts++;
    card.classList.add("wrong");
    navigator.vibrate?.(100);
    setTimeout(() => card.classList.remove("wrong"), 400);
    if (activeResetDigits) activeResetDigits();
    const txt = card.querySelector("#txt");
    if (txt) txt.value = "";
    if (attempts >= MAX_ATTEMPTS) setTimeout(startLockout, 150);
  }
}

// ---- Gate complete -> open vault ------------------------------------------
function onGateComplete() {
  gate.hidden = true;
  opening.hidden = false;
  supabase.auth.signInAnonymously().catch((err) => console.error("Sign-in failed:", err));
  setTimeout(() => {
    opening.hidden = true;
    vaultEl.hidden = false;
  }, 1000);
}

// ---- Vault: gallery, upload, delete, viewer --------------------------------
let photos = [];
let viewerIndex = 0;

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) loadGallery();
});

function showVaultError(msg) {
  empty.hidden = false;
  empty.textContent = msg;
}

async function loadGallery() {
  const { data: rows, error } = await supabase
    .from("photos")
    .select("id, path, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Gallery load error:", error);
    showVaultError("Can't load photos — check Supabase table policies (see README).");
    return;
  }

  if (!rows.length) { photos = []; renderGrid(); return; }

  // Bucket is private, so each file needs a temporary signed URL to display.
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(rows.map((r) => r.path), 3600);

  if (signErr) {
    console.error("Signed URL error:", signErr);
    showVaultError("Can't load photos — check Supabase storage policies (see README).");
    return;
  }

  photos = rows.map((r, i) => ({ id: r.id, path: r.path, url: signed[i]?.signedUrl }));
  renderGrid();
}

function renderGrid() {
  grid.innerHTML = "";
  empty.hidden = photos.length !== 0;
  empty.textContent = "No photos yet. Tap + Add.";
  photos.forEach((p, i) => {
    const tile = document.createElement("div");
    tile.className = "tile";
    const img = document.createElement("img");
    img.src = p.url;
    img.loading = "lazy";
    img.alt = "photo";
    tile.appendChild(img);
    tile.addEventListener("click", () => openViewer(i));
    grid.appendChild(tile);
  });
}

uploadInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  if (!files.length) return;
  uploadBar.hidden = false;
  for (let i = 0; i < files.length; i++) {
    uploadBarFill.style.width = `${Math.round((i / files.length) * 100)}%`;
    try {
      await uploadOne(files[i]);
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Couldn't save that photo — check Supabase policies (see README).");
      break;
    }
  }
  uploadBarFill.style.width = "100%";
  await loadGallery();
  setTimeout(() => (uploadBar.hidden = true), 250);
});

// Full-resolution upload — no compression. Stored in Supabase Storage,
// with just a path reference kept in the `photos` table.
async function uploadOne(file) {
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (upErr) throw upErr;

  const { error: insErr } = await supabase.from("photos").insert({ path });
  if (insErr) throw insErr;
}

function openViewer(i) { viewerIndex = i; viewerImg.src = photos[i].url; viewer.hidden = false; }
viewerClose.addEventListener("click", () => (viewer.hidden = true));
viewerPrev.addEventListener("click", () => { viewerIndex = (viewerIndex - 1 + photos.length) % photos.length; viewerImg.src = photos[viewerIndex].url; });
viewerNext.addEventListener("click", () => { viewerIndex = (viewerIndex + 1) % photos.length; viewerImg.src = photos[viewerIndex].url; });
document.addEventListener("keydown", (e) => {
  if (viewer.hidden) return;
  if (e.key === "Escape") viewer.hidden = true;
  if (e.key === "ArrowLeft") viewerPrev.click();
  if (e.key === "ArrowRight") viewerNext.click();
});
viewerDelete.addEventListener("click", async () => {
  const p = photos[viewerIndex];
  if (!p || !confirm("Delete this photo?")) return;
  try {
    await supabase.storage.from(BUCKET).remove([p.path]);
    await supabase.from("photos").delete().eq("id", p.id);
    viewer.hidden = true;
    await loadGallery();
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Couldn't delete that photo.");
  }
});

// ---- Boot -------------------------------------------------------------
renderStage();
resetIdle();
