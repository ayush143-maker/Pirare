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
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

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
const storage = getStorage(app);

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
  { type: "text", answer: "Ayush" },
  { type: "text", answer: "Ash" },
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
  progressFill.style.width = `${Math.round((stageIndex / STAGES.length) * 100)}%`;
  progressLabel.textContent = `Stage ${stageIndex + 1} / ${STAGES.length}`;

  const stage = STAGES[stageIndex];
  screenHost.innerHTML = "";
  const card = stage.type === "numeric" ? buildNumeric(stage) : buildText(stage);
  card.classList.add("card");
  card.setAttribute("data-t", stage.t);
  screenHost.appendChild(card);
}

function buildNumeric(stage) {
  const card = document.createElement("div");
  card.innerHTML = `
    <h2 class="card__title">Stage ${stageIndex + 1}</h2>
    <p class="card__hint">Enter the 6-digit code</p>
    <div class="dots" id="dots">${"<span></span>".repeat(6)}</div>
    <input class="numeric-input" id="numInput" type="tel" inputmode="numeric"
           maxlength="6" autocomplete="off" autocorrect="off" spellcheck="false" />
    <div class="keypad" id="keypad">
      ${[1,2,3,4,5,6,7,8,9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join("")}
      <button type="button" class="key-empty"></button>
      <button type="button" data-k="0">0</button>
      <button type="button" class="key-del" data-k="del">DEL</button>
    </div>
  `;
  const input = card.querySelector("#numInput");
  const dots = card.querySelectorAll("#dots span");
  const keypad = card.querySelector("#keypad");

  ["paste", "copy", "cut"].forEach((evt) => input.addEventListener(evt, (e) => e.preventDefault()));

  function sync() { dots.forEach((d, i) => d.classList.toggle("filled", i < input.value.length)); }

  keypad.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-k]");
    if (!btn || isLocked()) return;
    btn.classList.add("tap");
    setTimeout(() => btn.classList.remove("tap"), 120);
    if (btn.dataset.k === "del") input.value = input.value.slice(0, -1);
    else if (input.value.length < 6) input.value += btn.dataset.k;
    sync();
    if (input.value.length === 6) submit(input.value, card);
  });

  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 6);
    sync();
    if (input.value.length === 6) submit(input.value, card);
  });

  setTimeout(() => input.focus(), 30);
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
    const num = card.querySelector("#numInput");
    const txt = card.querySelector("#txt");
    if (num) { num.value = ""; card.querySelectorAll(".dots span").forEach((d) => d.classList.remove("filled")); }
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
  }, (err) => console.error("Gallery sync error:", err));
});

function renderGrid() {
  grid.innerHTML = "";
  empty.hidden = photos.length !== 0;
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
  for (const file of files) await uploadOne(file);
  uploadBar.hidden = true;
});

function uploadOne(file) {
  return new Promise((resolve, reject) => {
    const path = `vault/${Date.now()}-${file.name}`;
    const task = uploadBytesResumable(ref(storage, path), file);
    task.on("state_changed",
      (snap) => { uploadBarFill.style.width = `${Math.round((snap.bytesTransferred / snap.totalBytes) * 100)}%`; },
      (err) => { console.error("Upload failed:", err); reject(err); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        await addDoc(collection(db, "photos"), { url, storagePath: path, createdAt: serverTimestamp() });
        resolve();
      }
    );
  });
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
    await deleteDoc(doc(db, "photos", p.id));
    await deleteObject(ref(storage, p.storagePath));
    viewer.hidden = true;
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Couldn't delete that photo.");
  }
});

// ---- Boot -------------------------------------------------------------
renderStage();
resetIdle();
