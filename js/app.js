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
const viewerStage = document.getElementById("viewerStage");
const viewerImg = document.getElementById("viewerImg");
const viewerClose = document.getElementById("viewerClose");
const viewerDelete = document.getElementById("viewerDelete");
const viewerPrev = document.getElementById("viewerPrev");
const viewerNext = document.getElementById("viewerNext");
const selectionBar = document.getElementById("selectionBar");
const selectionCount = document.getElementById("selectionCount");
const selectionCancel = document.getElementById("selectionCancel");
const selectionDelete = document.getElementById("selectionDelete");

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
  if (!grid.children.length) renderSkeleton();

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

// ---- Grid: render, fade-in thumbnails, long-press selection ---------------
let selectionMode = false;
const selectedIds = new Set();

function renderSkeleton(count = 6) {
  grid.innerHTML = "";
  empty.hidden = true;
  for (let i = 0; i < count; i++) {
    const s = document.createElement("div");
    s.className = "skeleton-tile";
    grid.appendChild(s);
  }
}

function renderGrid() {
  grid.innerHTML = "";
  empty.hidden = photos.length !== 0;
  empty.textContent = "No photos yet. Tap + Add.";

  photos.forEach((p, i) => {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.dataset.id = p.id;

    const img = document.createElement("img");
    img.src = p.url;
    img.loading = "lazy";
    img.alt = "photo";
    img.draggable = false;
    img.addEventListener("load", () => img.classList.add("loaded"));
    tile.appendChild(img);

    const check = document.createElement("div");
    check.className = "tile__check";
    check.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    tile.appendChild(check);

    attachTileGestures(tile, p.id, i, img);
    grid.appendChild(tile);
  });

  // Re-apply selection visuals in case a reload happened mid-selection.
  grid.classList.toggle("selection-mode", selectionMode);
  grid.querySelectorAll(".tile").forEach((t) => {
    t.classList.toggle("selected", selectedIds.has(t.dataset.id));
  });
}

function attachTileGestures(tile, id, index, img) {
  const LONG_PRESS_MS = 450;
  const MOVE_CANCEL_PX = 10;
  let pressTimer = null;
  let longPressFired = false;
  let startX = 0, startY = 0;

  const clearPressTimer = () => { clearTimeout(pressTimer); pressTimer = null; };
  const cancelPress = () => { clearPressTimer(); tile.classList.remove("pressed"); };

  tile.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    longPressFired = false;
    startX = e.clientX;
    startY = e.clientY;
    tile.classList.add("pressed");
    pressTimer = setTimeout(() => {
      longPressFired = true;
      tile.classList.remove("pressed");
      navigator.vibrate?.(40);
      enterSelectionMode();
      toggleSelect(id, tile);
    }, LONG_PRESS_MS);
  });

  tile.addEventListener("pointermove", (e) => {
    if (!pressTimer) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_CANCEL_PX) cancelPress();
  });
  tile.addEventListener("pointerup", cancelPress);
  tile.addEventListener("pointerleave", cancelPress);
  tile.addEventListener("pointercancel", cancelPress);

  tile.addEventListener("click", () => {
    if (longPressFired) { longPressFired = false; return; }
    if (selectionMode) { toggleSelect(id, tile); return; }
    openViewer(index, img);
  });
}

function enterSelectionMode() {
  if (selectionMode) return;
  selectionMode = true;
  grid.classList.add("selection-mode");
  selectionBar.hidden = false;
}
function exitSelectionMode() {
  selectionMode = false;
  selectedIds.clear();
  grid.classList.remove("selection-mode");
  selectionBar.hidden = true;
  grid.querySelectorAll(".tile.selected").forEach((t) => t.classList.remove("selected"));
}
function toggleSelect(id, tile) {
  if (selectedIds.has(id)) { selectedIds.delete(id); tile.classList.remove("selected"); }
  else { selectedIds.add(id); tile.classList.add("selected"); }
  selectionCount.textContent = `${selectedIds.size} selected`;
  if (selectedIds.size === 0) exitSelectionMode();
}

selectionCancel.addEventListener("click", exitSelectionMode);
selectionDelete.addEventListener("click", async () => {
  if (!selectedIds.size) return;
  const targets = photos.filter((p) => selectedIds.has(p.id));
  if (!confirm(`Delete ${targets.length} photo(s)?`)) return;
  try {
    await supabase.storage.from(BUCKET).remove(targets.map((p) => p.path));
    await supabase.from("photos").delete().in("id", targets.map((p) => p.id));
    exitSelectionMode();
    await loadGallery();
  } catch (err) {
    console.error("Bulk delete failed:", err);
    alert("Couldn't delete the selected photos.");
  }
});

// ---- Upload -----------------------------------------------------------
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

// ---- Viewer: open/close FLIP animation, pinch/pan/swipe gestures ----------
let zoomScale = 1;
let panX = 0;
let panY = 0;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function applyZoomTransform() {
  const maxPan = 220 * (zoomScale - 1);
  panX = clamp(panX, -maxPan, maxPan);
  panY = clamp(panY, -maxPan, maxPan);
  viewerImg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
}

function resetZoomState() {
  zoomScale = 1;
  panX = 0;
  panY = 0;
  applyZoomTransform();
}

function tileImgFor(photoId) {
  const tile = grid.querySelector(`.tile[data-id="${CSS.escape(String(photoId))}"]`);
  return tile ? tile.querySelector("img") : null;
}

function openViewer(i, originImgEl) {
  viewerIndex = i;
  const photo = photos[i];
  if (!photo) return;

  const originRect = originImgEl ? originImgEl.getBoundingClientRect() : null;

  viewerImg.classList.remove("loaded", "spring");
  viewerImg.style.transition = "none";
  viewerImg.style.transform = "none";
  viewerImg.src = photo.url;

  viewer.hidden = false;
  viewer.classList.remove("controls-visible");
  requestAnimationFrame(() => viewer.classList.add("show"));

  const runEntrance = () => {
    resetZoomState();
    viewerImg.classList.add("loaded");

    if (originRect) {
      const finalRect = viewerImg.getBoundingClientRect();
      const scale = Math.min(originRect.width / finalRect.width, originRect.height / finalRect.height) || 1;
      const dx = (originRect.left + originRect.width / 2) - (finalRect.left + finalRect.width / 2);
      const dy = (originRect.top + originRect.height / 2) - (finalRect.top + finalRect.height / 2);
      viewerImg.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
      void viewerImg.offsetWidth; // force reflow before animating
      viewerImg.style.transition = "";
      viewerImg.classList.add("spring");
      requestAnimationFrame(() => { viewerImg.style.transform = "translate(0px, 0px) scale(1)"; });
    } else {
      viewerImg.style.transform = "scale(0.85)";
      void viewerImg.offsetWidth;
      viewerImg.style.transition = "";
      viewerImg.classList.add("spring");
      requestAnimationFrame(() => { viewerImg.style.transform = "translate(0px, 0px) scale(1)"; });
    }
  };

  if (viewerImg.complete && viewerImg.naturalWidth) runEntrance();
  else viewerImg.addEventListener("load", runEntrance, { once: true });
}

function closeViewer() {
  const photo = photos[viewerIndex];
  const targetImg = photo ? tileImgFor(photo.id) : null;
  const targetRect = targetImg ? targetImg.getBoundingClientRect() : null;

  viewer.classList.remove("controls-visible");
  viewerImg.classList.add("spring");
  viewerImg.classList.remove("loaded");
  viewer.style.opacity = "";

  if (targetRect) {
    const currentRect = viewerImg.getBoundingClientRect();
    const scale = Math.min(targetRect.width / currentRect.width, targetRect.height / currentRect.height) || 1;
    const dx = (targetRect.left + targetRect.width / 2) - (currentRect.left + currentRect.width / 2);
    const dy = (targetRect.top + targetRect.height / 2) - (currentRect.top + currentRect.height / 2);
    viewerImg.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  } else {
    viewerImg.style.transform = "scale(0.85)";
  }

  viewer.classList.remove("show");

  setTimeout(() => {
    viewer.hidden = true;
    viewerImg.style.transform = "";
    viewerImg.style.transition = "";
    viewerImg.classList.remove("spring");
    resetZoomState();
  }, 340);
}

function goTo(newIndex) {
  if (!photos.length) return;
  viewerIndex = (newIndex + photos.length) % photos.length;
  const photo = photos[viewerIndex];
  resetZoomState();
  viewerImg.classList.remove("loaded");
  viewerImg.style.transition = "";
  viewerImg.style.transform = "";
  viewerImg.src = photo.url;
  viewerImg.addEventListener("load", () => viewerImg.classList.add("loaded"), { once: true });
}

function toggleControls() {
  viewer.classList.toggle("controls-visible");
}

function handleDoubleTap(clientX, clientY) {
  if (zoomScale > 1) {
    zoomScale = 1;
    panX = 0;
    panY = 0;
  } else {
    const rect = viewerImg.getBoundingClientRect();
    const offsetX = clientX - (rect.left + rect.width / 2);
    const offsetY = clientY - (rect.top + rect.height / 2);
    zoomScale = 2.5;
    panX = -offsetX * (zoomScale - 1) / zoomScale;
    panY = -offsetY * (zoomScale - 1) / zoomScale;
  }
  viewerImg.style.transition = "transform .35s cubic-bezier(.34,1.56,.64,1)";
  applyZoomTransform();
  setTimeout(() => { viewerImg.style.transition = ""; }, 350);
}

viewerClose.addEventListener("click", closeViewer);
viewerPrev.addEventListener("click", () => goTo(viewerIndex - 1));
viewerNext.addEventListener("click", () => goTo(viewerIndex + 1));
document.addEventListener("keydown", (e) => {
  if (viewer.hidden) return;
  if (e.key === "Escape") closeViewer();
  if (e.key === "ArrowLeft") goTo(viewerIndex - 1);
  if (e.key === "ArrowRight") goTo(viewerIndex + 1);
});
viewerDelete.addEventListener("click", async () => {
  const p = photos[viewerIndex];
  if (!p || !confirm("Delete this photo?")) return;
  try {
    await supabase.storage.from(BUCKET).remove([p.path]);
    await supabase.from("photos").delete().eq("id", p.id);
    closeViewer();
    await loadGallery();
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Couldn't delete that photo.");
  }
});

// Pointer-based gestures on the stage: pinch-zoom, pan-when-zoomed,
// swipe-down-to-close, swipe-left/right-to-navigate, double-tap-to-zoom,
// single-tap-to-toggle-controls. Pointer Events give each touch/finger a
// distinct pointerId, so two simultaneous pointers = a pinch gesture.
const activePointers = new Map();
let isPinching = false;
let pinchStartDist = 0;
let pinchStartScale = 1;
let dragStart = null;
let lastTapTime = 0;
let lastTapPos = null;

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

viewerStage.addEventListener("pointerdown", (e) => {
  viewerStage.setPointerCapture(e.pointerId);
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 2) {
    isPinching = true;
    dragStart = null;
    const pts = [...activePointers.values()];
    pinchStartDist = dist(pts[0], pts[1]) || 1;
    pinchStartScale = zoomScale;
  } else if (activePointers.size === 1) {
    isPinching = false;
    dragStart = { x: e.clientX, y: e.clientY, panX, panY, time: Date.now(), moved: false };

    const now = Date.now();
    if (lastTapPos && now - lastTapTime < 320 && Math.hypot(e.clientX - lastTapPos.x, e.clientY - lastTapPos.y) < 40) {
      handleDoubleTap(e.clientX, e.clientY);
      lastTapTime = 0;
      lastTapPos = null;
    } else {
      lastTapTime = now;
      lastTapPos = { x: e.clientX, y: e.clientY };
    }
  }
});

viewerStage.addEventListener("pointermove", (e) => {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (isPinching && activePointers.size === 2) {
    const pts = [...activePointers.values()];
    const d = dist(pts[0], pts[1]) || 1;
    zoomScale = clamp(pinchStartScale * (d / pinchStartDist), 1, 4);
    applyZoomTransform();
    return;
  }

  if (activePointers.size === 1 && dragStart) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (Math.hypot(dx, dy) > 6) dragStart.moved = true;

    if (zoomScale > 1) {
      panX = dragStart.panX + dx;
      panY = dragStart.panY + dy;
      applyZoomTransform();
    } else if (Math.abs(dy) > Math.abs(dx)) {
      viewer.style.opacity = String(clamp(1 - Math.abs(dy) / 400, 0.3, 1));
      viewerImg.style.transform = `translateY(${dy}px) scale(${clamp(1 - Math.abs(dy) / 1000, 0.85, 1)})`;
    } else {
      viewerImg.style.transform = `translateX(${dx}px)`;
    }
  }
});

function settleSwipe() {
  viewer.style.opacity = "";
  viewerImg.style.transition = "transform .3s cubic-bezier(.34,1.56,.64,1)";
  viewerImg.style.transform = "";
  setTimeout(() => { viewerImg.style.transition = ""; }, 300);
}

function endGesture(e) {
  activePointers.delete(e.pointerId);

  if (isPinching && activePointers.size < 2) {
    isPinching = false;
    pinchStartDist = 0;
    if (zoomScale <= 1.02) resetZoomState();
  }

  if (activePointers.size === 0 && dragStart) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const dt = Date.now() - dragStart.time;
    const wasDrag = dragStart.moved;

    if (zoomScale <= 1 && wasDrag) {
      if (Math.abs(dy) > Math.abs(dx)) {
        if (dy > 110 || (dy > 60 && dt < 250)) closeViewer();
        else settleSwipe();
      } else if (Math.abs(dx) > 70) {
        goTo(dx < 0 ? viewerIndex + 1 : viewerIndex - 1);
      } else {
        settleSwipe();
      }
    } else if (!wasDrag && zoomScale <= 1) {
      toggleControls();
    }
    dragStart = null;
  }
}

viewerStage.addEventListener("pointerup", endGesture);
viewerStage.addEventListener("pointercancel", endGesture);
viewerImg.addEventListener("contextmenu", (e) => e.preventDefault());

// ---- Boot -------------------------------------------------------------
renderStage();
resetIdle();
