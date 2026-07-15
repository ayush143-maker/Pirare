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
  { type: "numeric", answer: "760707" },
  { type: "numeric", answer: "760708" },
  { type: "numeric", answer: "760709" },
  { type: "numeric", answer: "170707" },
  { type: "numeric", answer: "170708" },
  { type: "numeric", answer: "170709" },
  { type: "numeric", answer: "933595" },
  { type: "text", answer: "Ayush" },
  { type: "text", answer: "Ash" },
  { type: "text", answer: "Ayushxash" },
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
const viewerVideo = document.getElementById("viewerVideo");
const viewerClose = document.getElementById("viewerClose");
const viewerDelete = document.getElementById("viewerDelete");
const viewerFavorite = document.getElementById("viewerFavorite");
const viewerDownload = document.getElementById("viewerDownload");
const viewerPrev = document.getElementById("viewerPrev");
const viewerNext = document.getElementById("viewerNext");
const selectionBar = document.getElementById("selectionBar");
const selectionCount = document.getElementById("selectionCount");
const selectionCancel = document.getElementById("selectionCancel");
const selectionDelete = document.getElementById("selectionDelete");
const selectionAll = document.getElementById("selectionAll");
const selectionMove = document.getElementById("selectionMove");
const topChips = document.getElementById("topChips");
const albumsScreen = document.getElementById("albumsScreen");
const albumsGrid = document.getElementById("albumsGrid");
const albumSubbar = document.getElementById("albumSubbar");
const albumSubbarName = document.getElementById("albumSubbarName");
const albumBackBtn = document.getElementById("albumBackBtn");
const albumRenameBtn = document.getElementById("albumRenameBtn");
const albumDeleteBtn = document.getElementById("albumDeleteBtn");
const addMediaBtn = document.getElementById("addMediaBtn");
const toastHost = document.getElementById("toastHost");
const sheet = document.getElementById("sheet");
const sheetBackdrop = document.getElementById("sheetBackdrop");
const sheetTitle = document.getElementById("sheetTitle");
const sheetList = document.getElementById("sheetList");
const newAlbumForm = document.getElementById("newAlbumForm");
const newAlbumName = document.getElementById("newAlbumName");
const sheetCancel = document.getElementById("sheetCancel");

// ---- Toast notifications: non-blocking feedback for CRUD errors/success ---
function toast(message, kind = "error", duration = 3200) {
  const el = document.createElement("div");
  el.className = `toast toast--${kind}`;
  el.textContent = message;
  toastHost.appendChild(el);
  setTimeout(() => {
    el.classList.add("toast--leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, duration);
}

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

// ---- Vault: albums, favorites, selection, upload, viewer ------------------
// Fetch architecture, by design:
//   - Startup: fetch the ALBUM LIST only, plus one lightweight cover+count
//     query per album (never the full photo rows for every album).
//   - Opening an album or Favorites: fetch that view's photo rows + THUMBNAIL
//     signed URLs only (a separate, smaller stored file — not the original).
//   - Opening a photo in the viewer: the thumbnail displays instantly (it's
//     already in memory), then the full-resolution original is fetched and
//     swapped in — only for that one photo, only when actually opened.
let albums = [];            // [{id, name, count, coverUrl}]
let visiblePhotos = [];     // current view's photos (album contents or favorites)
let currentView = "albums"; // "albums" | "favorites" | "album"
let currentAlbumId = null;  // set when currentView === "album"
let viewerIndex = 0;

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) { syncView(); loadAlbumsList(); }
});

function showVaultError(msg) {
  empty.hidden = false;
  empty.textContent = msg;
}
function showAlbumsError(msg) {
  albumsGrid.innerHTML = `<p class="sheet__empty">${msg}</p>`;
}

// Keeps the two top chips, the album sub-bar, and which screen (Albums grid
// vs photo grid) is visible all in sync with current state.
function syncView() {
  topChips.querySelectorAll(".chip[data-view]").forEach((chip) => {
    const v = chip.dataset.view;
    const active = currentView === "album" ? v === "albums" : v === currentView;
    chip.classList.toggle("chip--active", active);
  });

  const insideAlbum = currentView === "album";
  albumSubbar.hidden = !insideAlbum;
  if (insideAlbum) {
    const a = albums.find((x) => x.id === currentAlbumId);
    albumSubbarName.textContent = a ? a.name : "Album";
  }

  const onAlbumsScreen = currentView === "albums";
  albumsScreen.hidden = !onAlbumsScreen;
  grid.hidden = onAlbumsScreen;
  empty.hidden = onAlbumsScreen || visiblePhotos.length !== 0;
}

function reloadCurrentView() {
  if (currentView === "favorites") return loadFavorites();
  if (currentView === "album" && currentAlbumId) return loadAlbumContents(currentAlbumId);
  return loadAlbumsList();
}

// Request tokens guard against race conditions: if the user taps between
// albums quickly, an older/slower request resolving after a newer one must
// not be allowed to overwrite the screen with stale data.
let albumsListToken = 0;
let albumContentsToken = 0;
let favoritesToken = 0;

// ---- Startup: album list + one cheap cover+count query per album ----------
async function loadAlbumsList() {
  const myToken = ++albumsListToken;
  const { data: albumRows, error } = await supabase
    .from("albums").select("id, name").order("created_at", { ascending: true });
  if (myToken !== albumsListToken) return; // a newer request has already landed

  if (error) {
    console.error("Album list load error:", error);
    showAlbumsError("Can't load albums — check Supabase table policies (see README).");
    toast("Couldn't load albums. Check your connection and try again.");
    return;
  }

  albums = (albumRows || []).map((a) => ({ ...a, count: 0, coverUrl: null }));
  renderAlbumsScreen(); // names visible immediately, covers fill in below

  await Promise.all(albums.map(async (a) => {
    try {
      // .limit(1) with { count: "exact" } fetches exactly one row (for the
      // cover) while still returning the true total count of matching rows —
      // one cheap query per album, never that album's full contents.
      const { data, count, error: covErr } = await supabase
        .from("photos")
        .select("id, path, thumb_path", { count: "exact" })
        .eq("album_id", a.id)
        .order("sort_order", { ascending: false })
        .limit(1);
      if (covErr) throw covErr;

      a.count = count || 0;
      const row = data?.[0];
      if (row) {
        const key = row.thumb_path || row.path;
        const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(key, 3600);
        if (!signErr) a.coverUrl = signed.signedUrl;
      }
    } catch (err) {
      console.error(`Cover load failed for album "${a.name}":`, err);
    }
  }));

  if (myToken !== albumsListToken) return;
  if (currentView === "albums") renderAlbumsScreen();
}

// Refreshes exactly one album's cover + count in place — used after any
// upload/delete/move so album cards never show stale data, without needing
// a full page reload or even being on the Albums screen when it happens.
async function refreshAlbumMeta(albumId) {
  const a = albums.find((x) => x.id === albumId);
  if (!a) return;
  try {
    const { data, count, error } = await supabase
      .from("photos")
      .select("id, path, thumb_path", { count: "exact" })
      .eq("album_id", albumId)
      .order("sort_order", { ascending: false })
      .limit(1);
    if (error) throw error;

    a.count = count || 0;
    const row = data?.[0];
    if (row) {
      const key = row.thumb_path || row.path;
      const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(key, 3600);
      a.coverUrl = signErr ? a.coverUrl : signed.signedUrl;
    } else {
      a.coverUrl = null;
    }
  } catch (err) {
    console.error(`Couldn't refresh album "${a.name}":`, err);
  }
  if (currentView === "albums") renderAlbumsScreen();
}

async function refreshAlbumsMeta(albumIds) {
  const unique = [...new Set(albumIds.filter(Boolean))];
  await Promise.all(unique.map((id) => refreshAlbumMeta(id)));
}

// ---- Opening an album: fetch that album's rows + thumbnail URLs only -----
async function loadAlbumContents(albumId) {
  const myToken = ++albumContentsToken;
  if (!grid.children.length) renderSkeleton();

  const { data: rows, error } = await supabase
    .from("photos")
    .select("id, path, thumb_path, album_id, is_favorite, media_type, created_at, sort_order")
    .eq("album_id", albumId)
    .order("sort_order", { ascending: false });
  if (myToken !== albumContentsToken) return;

  if (error) {
    console.error("Album contents load error:", error);
    showVaultError("Can't load this album — check Supabase table policies (see README).");
    toast("Couldn't load this album. Check your connection and try again.");
    return;
  }
  if (!rows.length) { visiblePhotos = []; renderGrid(); syncView(); return; }

  const thumbKeys = rows.map((r) => r.thumb_path || r.path);
  const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrls(thumbKeys, 3600);
  if (myToken !== albumContentsToken) return;
  if (signErr) {
    console.error("Signed URL error:", signErr);
    showVaultError("Can't load thumbnails — check Supabase storage policies (see README).");
    toast("Couldn't load thumbnails. Check your connection and try again.");
    return;
  }

  visiblePhotos = rows.map((r, i) => ({ ...r, url: signed[i]?.signedUrl }));
  renderGrid();
  syncView();
}

// ---- Favorites: metadata + thumbnails for favorited items only -----------
async function loadFavorites() {
  const myToken = ++favoritesToken;
  if (!grid.children.length) renderSkeleton();

  const { data: rows, error } = await supabase
    .from("photos")
    .select("id, path, thumb_path, album_id, is_favorite, media_type, created_at, sort_order")
    .eq("is_favorite", true)
    .order("sort_order", { ascending: false });
  if (myToken !== favoritesToken) return;

  if (error) {
    console.error("Favorites load error:", error);
    showVaultError("Can't load favorites — check Supabase table policies (see README).");
    toast("Couldn't load favorites. Check your connection and try again.");
    return;
  }
  if (!rows.length) { visiblePhotos = []; renderGrid(); syncView(); return; }

  const thumbKeys = rows.map((r) => r.thumb_path || r.path);
  const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrls(thumbKeys, 3600);
  if (myToken !== favoritesToken) return;
  if (signErr) {
    console.error("Signed URL error:", signErr);
    showVaultError("Can't load thumbnails — check Supabase storage policies (see README).");
    toast("Couldn't load thumbnails. Check your connection and try again.");
    return;
  }

  visiblePhotos = rows.map((r, i) => ({ ...r, url: signed[i]?.signedUrl }));
  renderGrid();
  syncView();
}

// ---- Top nav: Albums / Favorites -------------------------------------
topChips.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip[data-view]");
  if (!chip) return;
  const view = chip.dataset.view;

  if (view === "albums") {
    currentView = "albums";
    currentAlbumId = null;
    syncView();
    renderAlbumsScreen();
  } else if (view === "favorites") {
    currentView = "favorites";
    currentAlbumId = null;
    syncView();
    loadFavorites();
  }
});

albumBackBtn.addEventListener("click", () => {
  currentView = "albums";
  currentAlbumId = null;
  syncView();
  renderAlbumsScreen();
});

addMediaBtn.addEventListener("click", () => uploadInput.click());

// ---- Albums screen: grid of album cards + "Create New Album" -------------
function renderAlbumsScreen() {
  albumsGrid.innerHTML = "";

  const createCard = document.createElement("button");
  createCard.type = "button";
  createCard.className = "album-card album-card--create";
  createCard.innerHTML = `<span class="album-card__plus">+</span><span class="album-card__label">Create New Album</span>`;
  createCard.addEventListener("click", () => openAlbumSheet("create"));
  albumsGrid.appendChild(createCard);

  albums.forEach((a) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "album-card";

    const coverEl = document.createElement("div");
    coverEl.className = "album-card__cover" + (a.coverUrl ? "" : " album-card__cover--empty");
    if (a.coverUrl) coverEl.style.backgroundImage = `url('${a.coverUrl}')`;
    else coverEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;
    card.appendChild(coverEl);

    const meta = document.createElement("div");
    meta.className = "album-card__meta";
    const nameEl = document.createElement("span");
    nameEl.className = "album-card__name";
    nameEl.textContent = a.name;
    const countEl = document.createElement("span");
    countEl.className = "album-card__count";
    countEl.textContent = `${a.count} item${a.count === 1 ? "" : "s"}`;
    meta.appendChild(nameEl);
    meta.appendChild(countEl);
    card.appendChild(meta);

    card.addEventListener("click", () => {
      currentView = "album";
      currentAlbumId = a.id;
      syncView();
      loadAlbumContents(a.id);
    });

    albumsGrid.appendChild(card);
  });
}

// ---- Bottom sheet: create album / move selected photos --------------------
let sheetMode = "create";

function openAlbumSheet(mode) {
  sheetMode = mode;
  sheet.hidden = false;
  newAlbumForm.hidden = false;
  setTimeout(() => newAlbumName.focus(), 50);

  if (mode === "rename") {
    const a = albums.find((x) => x.id === currentAlbumId);
    sheetTitle.textContent = "Rename album";
    sheetList.hidden = true;
    newAlbumName.value = a ? a.name : "";
    newAlbumForm.querySelector("button").textContent = "Save";
    return;
  }

  newAlbumName.value = "";

  if (mode === "create") {
    sheetTitle.textContent = "New album";
    sheetList.hidden = true;
    newAlbumForm.querySelector("button").textContent = "Create";
  } else {
    sheetTitle.textContent = "Move to album";
    sheetList.hidden = false;
    sheetList.innerHTML = "";
    if (!albums.length) {
      const p = document.createElement("p");
      p.className = "sheet__empty";
      p.textContent = "No albums yet — create one below.";
      sheetList.appendChild(p);
    }
    albums.forEach((a) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sheet__album-btn";
      btn.textContent = a.name;
      btn.addEventListener("click", () => moveSelectedTo(a.id));
      sheetList.appendChild(btn);
    });
    newAlbumForm.querySelector("button").textContent = "Create & move";
  }
}
function closeSheet() { sheet.hidden = true; }
sheetBackdrop.addEventListener("click", closeSheet);
sheetCancel.addEventListener("click", closeSheet);

newAlbumForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = newAlbumName.value.trim();
  if (!name) return;

  if (sheetMode === "rename") {
    const a = albums.find((x) => x.id === currentAlbumId);
    if (!a) { closeSheet(); return; }
    const previousName = a.name;
    a.name = name; // optimistic — instant UI update
    albumSubbarName.textContent = name;
    closeSheet();
    try {
      const { error } = await supabase.from("albums").update({ name }).eq("id", a.id);
      if (error) throw error;
      toast("Album renamed.", "success");
    } catch (err) {
      console.error("Rename failed:", err);
      a.name = previousName; // rollback on failure
      albumSubbarName.textContent = previousName;
      toast("Couldn't rename that album.");
    }
    return;
  }

  try {
    const { data, error } = await supabase.from("albums").insert({ name }).select().single();
    if (error) throw error;
    albums.push({ id: data.id, name: data.name, count: 0, coverUrl: null });
    if (sheetMode === "move") {
      await moveSelectedTo(data.id);
    } else {
      // Jump straight into the new (empty) album so it's obvious it worked.
      closeSheet();
      currentView = "album";
      currentAlbumId = data.id;
      syncView();
      loadAlbumContents(data.id);
    }
  } catch (err) {
    console.error("Create album failed:", err);
    toast("Couldn't create that album.");
  }
});

albumRenameBtn.addEventListener("click", () => {
  if (!currentAlbumId) return;
  openAlbumSheet("rename");
});

// Deleting an album never deletes its photos — they're moved to a catch-all
// "Unsorted" album first, so nothing is ever silently lost or orphaned.
async function ensureUnsortedAlbum() {
  let a = albums.find((x) => x.name.toLowerCase() === "unsorted");
  if (a) return a.id;
  const { data, error } = await supabase.from("albums").insert({ name: "Unsorted" }).select().single();
  if (error) throw error;
  a = { id: data.id, name: data.name, count: 0, coverUrl: null };
  albums.push(a);
  return a.id;
}

albumDeleteBtn.addEventListener("click", async () => {
  if (!currentAlbumId) return;
  const a = albums.find((x) => x.id === currentAlbumId);
  if (!a) return;

  if (a.name.toLowerCase() === "unsorted") {
    toast("The Unsorted album can't be deleted — it's where photos land if their album is ever removed.");
    return;
  }

  if (!confirm(`Delete "${a.name}"? Its photos will be moved to Unsorted, not deleted.`)) return;

  try {
    const unsortedId = await ensureUnsortedAlbum();
    const { error: moveErr } = await supabase.from("photos").update({ album_id: unsortedId }).eq("album_id", currentAlbumId);
    if (moveErr) throw moveErr;

    const { error: delErr } = await supabase.from("albums").delete().eq("id", currentAlbumId);
    if (delErr) throw delErr;

    albums = albums.filter((x) => x.id !== currentAlbumId);
    await refreshAlbumMeta(unsortedId);

    currentView = "albums";
    currentAlbumId = null;
    syncView();
    renderAlbumsScreen();
    toast(`"${a.name}" deleted. Its photos are in Unsorted.`, "success");
  } catch (err) {
    console.error("Album delete failed:", err);
    toast("Couldn't delete that album.");
  }
});

async function moveSelectedTo(albumId) {
  if (!selectedIds.size) return;
  const ids = [...selectedIds];
  // Selection can span multiple albums (e.g. moving items while browsing
  // Favorites), so every source album's card needs refreshing too, not
  // just the destination.
  const sourceAlbumIds = visiblePhotos.filter((p) => ids.includes(p.id)).map((p) => p.album_id);
  try {
    const { error } = await supabase.from("photos").update({ album_id: albumId }).in("id", ids);
    if (error) throw error;
    closeSheet();
    exitSelectionMode();
    await reloadCurrentView();
    await refreshAlbumsMeta([...sourceAlbumIds, albumId]);
    toast(`Moved ${ids.length} item${ids.length === 1 ? "" : "s"}.`, "success");
  } catch (err) {
    console.error("Move failed:", err);
    toast("Couldn't move the selected photos.");
  }
}

// ---- Grid: render, fade-in thumbnails, long-press select -------------------
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
  empty.hidden = visiblePhotos.length !== 0;
  empty.textContent = "No photos yet. Tap + Add.";

  visiblePhotos.forEach((p, i) => {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.dataset.id = p.id;
    if (p.is_favorite) tile.classList.add("is-favorite");
    tile.addEventListener("contextmenu", (e) => e.preventDefault());

    let mediaEl;
    if (p.media_type === "video") {
      mediaEl = document.createElement("video");
      mediaEl.src = p.url; // metadata-only preload below keeps this cheap
      mediaEl.muted = true;
      mediaEl.preload = "metadata";
      mediaEl.setAttribute("disablePictureInPicture", "");
      mediaEl.addEventListener("loadeddata", () => mediaEl.classList.add("loaded"));
      mediaEl.addEventListener("contextmenu", (e) => e.preventDefault());

      const badge = document.createElement("div");
      badge.className = "tile__video-badge";
      badge.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg>`;
      tile.appendChild(mediaEl);
      tile.appendChild(badge);
    } else {
      mediaEl = document.createElement("img");
      mediaEl.src = p.url; // thumbnail — the original is never touched here
      mediaEl.loading = "lazy";
      mediaEl.alt = "photo";
      mediaEl.draggable = false;
      mediaEl.addEventListener("load", () => mediaEl.classList.add("loaded"));
      mediaEl.addEventListener("contextmenu", (e) => e.preventDefault());
      tile.appendChild(mediaEl);
    }

    const check = document.createElement("div");
    check.className = "tile__check";
    check.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    tile.appendChild(check);

    attachTileGestures(tile, p.id, i, mediaEl);
    grid.appendChild(tile);
  });

  grid.classList.toggle("selection-mode", selectionMode);
  grid.querySelectorAll(".tile").forEach((t) => {
    t.classList.toggle("selected", selectedIds.has(t.dataset.id));
  });
}

function attachTileGestures(tile, id, index, mediaEl) {
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
    openViewer(index, mediaEl);
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

selectionAll.addEventListener("click", () => {
  visiblePhotos.forEach((p) => selectedIds.add(p.id));
  grid.querySelectorAll(".tile").forEach((t) => t.classList.toggle("selected", selectedIds.has(t.dataset.id)));
  selectionCount.textContent = `${selectedIds.size} selected`;
});

selectionMove.addEventListener("click", () => {
  if (!selectedIds.size) return;
  openAlbumSheet("move");
});

selectionDelete.addEventListener("click", async () => {
  if (!selectedIds.size) return;
  const targets = visiblePhotos.filter((p) => selectedIds.has(p.id));
  if (!confirm(`Delete ${targets.length} photo(s)?`)) return;
  const filesToRemove = targets.flatMap((p) => [p.path, p.thumb_path].filter(Boolean));
  const affectedAlbumIds = targets.map((p) => p.album_id);
  try {
    await supabase.storage.from(BUCKET).remove(filesToRemove);
    await supabase.from("photos").delete().in("id", targets.map((p) => p.id));
    exitSelectionMode();
    await reloadCurrentView();
    await refreshAlbumsMeta(affectedAlbumIds);
    toast(`Deleted ${targets.length} item${targets.length === 1 ? "" : "s"}.`, "success");
  } catch (err) {
    console.error("Bulk delete failed:", err);
    toast("Couldn't delete the selected photos.");
  }
});

// ---- Upload: only allowed inside an open album (nowhere else to file it) --
uploadInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  if (!files.length) return;

  if (currentView !== "album" || !currentAlbumId) {
    toast("Open an album first, then add photos or videos to it.");
    return;
  }

  uploadBar.hidden = false;
  let uploadedCount = 0;
  for (let i = 0; i < files.length; i++) {
    uploadBarFill.style.width = `${Math.round((i / files.length) * 100)}%`;
    try {
      await uploadOne(files[i]);
      uploadedCount++;
    } catch (err) {
      console.error("Upload failed:", err);
      toast("Couldn't save that file — check Supabase policies (see README).");
      break;
    }
  }
  uploadBarFill.style.width = "100%";
  await loadAlbumContents(currentAlbumId);
  await refreshAlbumMeta(currentAlbumId);
  if (uploadedCount) toast(`Added ${uploadedCount} item${uploadedCount === 1 ? "" : "s"}.`, "success");
  setTimeout(() => (uploadBar.hidden = true), 250);
});

// Full-resolution original, uploaded as-is — plus a small compressed
// thumbnail generated right in the browser for images, so the grid never
// has to move original-sized bytes. Videos keep their single stored file;
// the grid's <video preload="metadata"> already avoids pulling full bytes.
function makeThumbnail(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { resolve(null); return; }
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read file"));
    reader.onload = () => { img.src = reader.result; };
    img.onerror = () => reject(new Error("Couldn't decode image"));
    img.onload = () => {
      const maxDim = 480;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.72);
    };
    reader.readAsDataURL(file);
  });
}

async function uploadOne(file) {
  const base = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
  const path = `original/${base}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (upErr) throw upErr;

  let thumbPath = null;
  try {
    const thumbBlob = await makeThumbnail(file);
    if (thumbBlob) {
      const candidate = `thumbs/${base}.jpg`;
      const { error: thumbErr } = await supabase.storage.from(BUCKET).upload(candidate, thumbBlob, {
        cacheControl: "3600",
        upsert: false,
        contentType: "image/jpeg",
      });
      if (thumbErr) console.error("Thumbnail upload failed, falling back to original for display:", thumbErr);
      else thumbPath = candidate;
    }
  } catch (err) {
    console.error("Thumbnail generation failed, falling back to original for display:", err);
  }

  const mediaType = file.type.startsWith("video/") ? "video" : "image";
  const { error: insErr } = await supabase.from("photos").insert({
    path,
    thumb_path: thumbPath,
    media_type: mediaType,
    album_id: currentAlbumId,
    sort_order: Date.now(),
  });
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

function tileMediaFor(photoId) {
  const tile = grid.querySelector(`.tile[data-id="${CSS.escape(String(photoId))}"]`);
  return tile ? tile.querySelector("img, video") : null;
}

function syncViewerFavoriteButton(photo) {
  viewerFavorite.classList.toggle("is-active", !!photo.is_favorite);
  viewerFavorite.querySelector("svg").setAttribute("fill", photo.is_favorite ? "currentColor" : "none");
}

function showMediaForCurrent(photo, src) {
  if (photo.media_type === "video") {
    viewerImg.hidden = true;
    viewerVideo.hidden = false;
    viewerVideo.src = src;
    viewerVideo.currentTime = 0;
  } else {
    viewerVideo.pause();
    viewerVideo.removeAttribute("src");
    viewerVideo.load();
    viewerVideo.hidden = true;
    viewerImg.hidden = false;
  }
}

// Fetches the full-resolution original for exactly one photo, only once it's
// actually open in the viewer — then swaps it in seamlessly (the browser
// keeps showing the thumbnail until the original finishes decoding, so
// there's no flash). Videos skip this: there's no separate video original
// to fetch, they already stream the single stored file on demand.
async function upgradeToOriginal(photo, forIndex) {
  if (photo.media_type === "video") return;
  if (!photo.originalUrl) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(photo.path, 3600);
      if (error) throw error;
      photo.originalUrl = data.signedUrl;
    } catch (err) {
      console.error("Couldn't load full-resolution image:", err);
      return; // thumbnail stays displayed — lower quality, but not broken
    }
  }
  if (viewerIndex === forIndex && visiblePhotos[viewerIndex]?.id === photo.id) {
    viewerImg.src = photo.originalUrl;
  }
}

function openViewer(i, originMediaEl) {
  viewerIndex = i;
  const photo = visiblePhotos[i];
  if (!photo) return;

  syncViewerFavoriteButton(photo);

  if (photo.media_type === "video") {
    // Videos skip the FLIP zoom-from-thumbnail — native controls take over instead.
    showMediaForCurrent(photo, photo.url);
    viewer.hidden = false;
    viewer.classList.remove("controls-visible");
    requestAnimationFrame(() => viewer.classList.add("show"));
    return;
  }

  const originRect = originMediaEl ? originMediaEl.getBoundingClientRect() : null;

  viewerImg.classList.remove("loaded", "spring");
  viewerImg.style.transition = "none";
  viewerImg.style.transform = "none";
  showMediaForCurrent(photo, photo.url);
  viewerImg.src = photo.url; // thumbnail shows instantly — original fetched below

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
      void viewerImg.offsetWidth;
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

  upgradeToOriginal(photo, i);
}

function closeViewer() {
  const photo = visiblePhotos[viewerIndex];
  const isVideo = photo?.media_type === "video";
  const targetEl = photo ? tileMediaFor(photo.id) : null;
  const targetRect = !isVideo && targetEl ? targetEl.getBoundingClientRect() : null;

  viewer.classList.remove("controls-visible");
  viewer.style.opacity = "";

  if (!isVideo) {
    viewerImg.classList.add("spring");
    viewerImg.classList.remove("loaded");
    if (targetRect) {
      const currentRect = viewerImg.getBoundingClientRect();
      const scale = Math.min(targetRect.width / currentRect.width, targetRect.height / currentRect.height) || 1;
      const dx = (targetRect.left + targetRect.width / 2) - (currentRect.left + currentRect.width / 2);
      const dy = (targetRect.top + targetRect.height / 2) - (currentRect.top + currentRect.height / 2);
      viewerImg.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    } else {
      viewerImg.style.transform = "scale(0.85)";
    }
  }

  viewer.classList.remove("show");

  setTimeout(() => {
    viewer.hidden = true;
    viewerImg.style.transform = "";
    viewerImg.style.transition = "";
    viewerImg.classList.remove("spring");
    viewerVideo.pause();
    resetZoomState();
  }, 340);
}

function goTo(newIndex) {
  if (!visiblePhotos.length) return;
  viewerIndex = (newIndex + visiblePhotos.length) % visiblePhotos.length;
  const photo = visiblePhotos[viewerIndex];
  resetZoomState();
  syncViewerFavoriteButton(photo);

  if (photo.media_type === "video") {
    showMediaForCurrent(photo, photo.url);
    return;
  }

  viewerImg.classList.remove("loaded");
  viewerImg.style.transition = "";
  viewerImg.style.transform = "";
  showMediaForCurrent(photo, photo.url);
  viewerImg.src = photo.url;
  viewerImg.addEventListener("load", () => viewerImg.classList.add("loaded"), { once: true });

  upgradeToOriginal(photo, viewerIndex);
}

function toggleControls() {
  viewer.classList.toggle("controls-visible");
}

function handleDoubleTap(clientX, clientY) {
  if (visiblePhotos[viewerIndex]?.media_type === "video") return;
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

viewerFavorite.addEventListener("click", async () => {
  const photo = visiblePhotos[viewerIndex];
  if (!photo) return;
  const next = !photo.is_favorite;
  try {
    const { error } = await supabase.from("photos").update({ is_favorite: next }).eq("id", photo.id);
    if (error) throw error;
    photo.is_favorite = next;
  } catch (err) {
    console.error("Favorite toggle failed:", err);
    return;
  }

  syncViewerFavoriteButton(photo);
  viewerFavorite.classList.remove("bloom");
  void viewerFavorite.offsetWidth;
  if (next) viewerFavorite.classList.add("bloom");

  const tile = grid.querySelector(`.tile[data-id="${CSS.escape(String(photo.id))}"]`);
  if (tile) tile.classList.toggle("is-favorite", next);

  // Un-favoriting while inside the Favorites view should drop it immediately.
  if (currentView === "favorites" && !next) {
    visiblePhotos = visiblePhotos.filter((p) => p.id !== photo.id);
    renderGrid();
    syncView();
    if (!visiblePhotos.length) closeViewer();
    else goTo(Math.min(viewerIndex, visiblePhotos.length - 1));
  }
});

viewerDownload.addEventListener("click", async () => {
  const photo = visiblePhotos[viewerIndex];
  if (!photo) return;
  try {
    let url = photo.originalUrl;
    if (!url) {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(photo.path, 3600);
      if (error) throw error;
      url = data.signedUrl;
      photo.originalUrl = url;
    }
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = photo.path.split("/").pop() || "vault-file";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (err) {
    console.error("Download failed:", err);
    toast("Couldn't download that file.");
  }
});

viewerDelete.addEventListener("click", async () => {
  const p = visiblePhotos[viewerIndex];
  if (!p || !confirm("Delete this item?")) return;
  try {
    const filesToRemove = [p.path, p.thumb_path].filter(Boolean);
    await supabase.storage.from(BUCKET).remove(filesToRemove);
    await supabase.from("photos").delete().eq("id", p.id);
    closeViewer();
    await reloadCurrentView();
    await refreshAlbumMeta(p.album_id);
    toast("Item deleted.", "success");
  } catch (err) {
    console.error("Delete failed:", err);
    toast("Couldn't delete that item.");
  }
});

// Pointer-based gestures on the stage: pinch-zoom, pan-when-zoomed,
// swipe-down-to-close, swipe-left/right-to-navigate, double-tap-to-zoom,
// single-tap-to-toggle-controls. Skipped entirely for videos — native
// video controls take over and we don't want gesture conflicts.
const activePointers = new Map();
let isPinching = false;
let pinchStartDist = 0;
let pinchStartScale = 1;
let dragStart = null;
let lastTapTime = 0;
let lastTapPos = null;

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function isCurrentVideo() { return visiblePhotos[viewerIndex]?.media_type === "video"; }

viewerStage.addEventListener("pointerdown", (e) => {
  if (isCurrentVideo()) return;
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
  if (isCurrentVideo()) return;
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
  if (isCurrentVideo()) { activePointers.delete(e.pointerId); return; }
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
