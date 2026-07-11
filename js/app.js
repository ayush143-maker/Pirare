// ==========================================================================
// app.js — everything in one file on purpose: fewer moving parts, fewer
// places a relative-import typo can break the page on a static host.
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  query, orderBy, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---- Firebase config -----------------------------------------------------
// Not a secret (see README) — real protection comes from the Firestore /
// Storage rules, not from hiding this object.
const firebaseConfig = {
  apiKey: "AIzaSyCQ_V5rHfMDqGeFMTh1Qc8Gd31e98WRrAQ",
  authDomain: "x7nova-10d48.firebaseapp.com",
  databaseURL: "https://x7nova-10d48-default-rtdb.firebaseio.com",
  projectId: "x7nova-10d48",
  storageBucket: "x7nova-10d48.firebasestorage.app",
  messagingSenderId: "1020595991551",
  appId: "1:1020595991551:web:9c610a950d1051c7826dca",
  measurementId: "G-Z37KP4T6VP",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

  function sync() { dots.forEach((d, i) => d.classList.toggle("filled", i < buffer.length)); }

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

  function reset() { buffer = ""; sync(); }

  keypad.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-k]");
    if (!btn || isLocked()) return;
    btn.classList.add("tap");
    setTimeout(() => btn.classList.remove("tap"), 120);
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
  signInAnonymously(auth).catch((err) => console.error("Sign-in failed:", err));
  setTimeout(() => {
    opening.hidden = true;
    vaultEl.hidden = false;
  }, 1000);
}

// ---- Vault: gallery, upload, delete, viewer --------------------------------
let photos = [];
let viewerIndex = 0;

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  const q = query(collection(db, "photos"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    photos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderGrid();
  }, (err) => {
    console.error("Gallery sync error:", err);
    showVaultError("Can't load photos — check Firestore rules (see README).");
  });
});

function showVaultError(msg) {
  empty.hidden = false;
  empty.textContent = msg;
}

function renderGrid() {
  grid.innerHTML = "";
  empty.hidden = photos.length !== 0;
  empty.textContent = "No photos yet. Tap + Add.";
  photos.forEach((p, i) => {
    const tile = document.createElement("div");
    tile.className = "tile";
    const img = document.createElement("img");
    img.src = p.data;
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
      alert("Couldn't save that photo — check Firestore rules (see README), or it may still be too large even after compression.");
      break;
    }
  }
  uploadBarFill.style.width = "100%";
  setTimeout(() => (uploadBar.hidden = true), 250);
});

// Firestore documents cap out at 1MB. We compress + shrink the image on
// the phone before it ever leaves the browser, stepping down quality and
// size until the resulting base64 string comfortably fits, then store it
// directly as a Firestore field — no Storage bucket, no Blaze plan needed.
const MAX_BASE64_CHARS = 700 * 1024; // ~700KB of base64 text, safely under 1MB doc cap

async function uploadOne(file) {
  const dataUrl = await compressToFit(file);
  await addDoc(collection(db, "photos"), { data: dataUrl, createdAt: serverTimestamp() });
}

function compressToFit(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read file"));
    reader.onload = () => { img.src = reader.result; };
    img.onerror = () => reject(new Error("Couldn't decode image"));
    img.onload = () => {
      let maxDim = 1600;
      let quality = 0.82;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const attempt = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);

        if (dataUrl.length <= MAX_BASE64_CHARS || (maxDim <= 480 && quality <= 0.4)) {
          resolve(dataUrl);
          return;
        }
        // Still too big: shrink dimensions first, then drop quality, and try again.
        if (maxDim > 480) maxDim = Math.round(maxDim * 0.8);
        else quality = Math.max(0.4, quality - 0.1);
        attempt();
      };
      attempt();
    };
    reader.readAsDataURL(file);
  });
}

function openViewer(i) { viewerIndex = i; viewerImg.src = photos[i].data; viewer.hidden = false; }
viewerClose.addEventListener("click", () => (viewer.hidden = true));
viewerPrev.addEventListener("click", () => { viewerIndex = (viewerIndex - 1 + photos.length) % photos.length; viewerImg.src = photos[viewerIndex].data; });
viewerNext.addEventListener("click", () => { viewerIndex = (viewerIndex + 1) % photos.length; viewerImg.src = photos[viewerIndex].data; });
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
    await deleteDoc(doc(db, "photos", p.id));
    viewer.hidden = true;
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Couldn't delete that photo.");
  }
});

// ---- Boot -------------------------------------------------------------
renderStage();
resetIdle();
