// ==========================================================================
// vault.js
// Real authentication (Firebase Auth) + the photo gallery itself.
// This is the actual security boundary of the app — see firebase-config.js
// for why, and README.md for the Firestore/Storage rules this relies on.
// ==========================================================================

import {
  auth, db, storage,
  signInWithEmailAndPassword, onAuthStateChanged, signOut,
  collection, addDoc, deleteDoc, doc, query, where, orderBy, onSnapshot, serverTimestamp,
  ref, uploadBytesResumable, getDownloadURL, deleteObject,
} from "./firebase-config.js";

const authGate = document.getElementById("authGate");
const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authError = document.getElementById("authError");
const authSubmit = document.getElementById("authSubmit");

const vaultOpening = document.getElementById("vaultOpening");
const vaultEl = document.getElementById("vault");
const masonry = document.getElementById("masonry");
const emptyState = document.getElementById("emptyState");
const uploadInput = document.getElementById("uploadInput");
const uploadProgress = document.getElementById("uploadProgress");
const uploadProgressBar = document.getElementById("uploadProgressBar");
const uploadProgressLabel = document.getElementById("uploadProgressLabel");
const signOutBtn = document.getElementById("signOutBtn");

const viewer = document.getElementById("viewer");
const viewerImg = document.getElementById("viewerImg");
const viewerClose = document.getElementById("viewerClose");
const viewerDelete = document.getElementById("viewerDelete");
const viewerPrev = document.getElementById("viewerPrev");
const viewerNext = document.getElementById("viewerNext");

let currentPhotos = [];
let viewerIndex = 0;
let unsubscribeSnapshot = null;

// ---------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------
authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.textContent = "";
  authSubmit.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, authEmail.value.trim(), authPassword.value);
    // onAuthStateChanged below handles the transition into the vault.
  } catch (err) {
    authError.textContent = friendlyAuthError(err.code);
    authSubmit.disabled = false;
  }
});

function friendlyAuthError(code) {
  switch (code) {
    case "auth/invalid-email": return "That email address doesn't look right.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential": return "Email or password is incorrect.";
    case "auth/too-many-requests": return "Too many attempts. Try again shortly.";
    default: return "Sign-in failed. Please try again.";
  }
}

onAuthStateChanged(auth, (user) => {
  const puzzleGateCleared = document.getElementById("gate").hidden;

  if (user) {
    playVaultOpeningThen(() => enterVault(user));
  } else {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    vaultEl.hidden = true;
    // Only reveal the sign-in form once the 10-screen puzzle is cleared.
    // If the puzzle hasn't been cleared yet, leave authGate hidden —
    // gatekeeper.js is responsible for revealing it when the sequence finishes.
    if (puzzleGateCleared) authGate.hidden = false;
  }
});

function playVaultOpeningThen(cb) {
  authGate.hidden = true;
  vaultOpening.hidden = false;
  setTimeout(() => {
    vaultOpening.hidden = true;
    cb();
  }, 1500);
}

// ---------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------
function enterVault(user) {
  vaultEl.hidden = false;
  const q = query(
    collection(db, "photos"),
    where("uid", "==", user.uid),
    orderBy("createdAt", "desc")
  );
  unsubscribeSnapshot = onSnapshot(q, (snap) => {
    currentPhotos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderMasonry();
  }, (err) => {
    console.error("Gallery sync error:", err);
  });
}

function renderMasonry() {
  masonry.innerHTML = "";
  emptyState.hidden = currentPhotos.length !== 0;
  currentPhotos.forEach((photo, i) => {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.style.animationDelay = `${Math.min(i, 10) * 40}ms`;
    const img = document.createElement("img");
    img.src = photo.url;
    img.loading = "lazy";
    img.alt = "Private photo";
    tile.appendChild(img);
    tile.addEventListener("click", () => openViewer(i));
    masonry.appendChild(tile);
  });
}

// ---------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------
uploadInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  const user = auth.currentUser;
  if (!user || files.length === 0) return;

  uploadProgress.hidden = false;
  for (const file of files) {
    await uploadOne(file, user.uid);
  }
  uploadProgress.hidden = true;
});

function uploadOne(file, uid) {
  return new Promise((resolve, reject) => {
    const path = `vault/${uid}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        uploadProgressBar.style.width = `${pct}%`;
        uploadProgressLabel.textContent = `Uploading ${file.name} — ${pct}%`;
      },
      (err) => { console.error("Upload failed:", err); reject(err); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        await addDoc(collection(db, "photos"), {
          uid,
          url,
          storagePath: path,
          createdAt: serverTimestamp(),
        });
        resolve();
      }
    );
  });
}

// ---------------------------------------------------------------------
// Fullscreen viewer
// ---------------------------------------------------------------------
function openViewer(index) {
  viewerIndex = index;
  updateViewerImage();
  viewer.hidden = false;
}
function updateViewerImage() {
  viewerImg.src = currentPhotos[viewerIndex]?.url || "";
}
viewerClose.addEventListener("click", () => (viewer.hidden = true));
viewerPrev.addEventListener("click", () => {
  viewerIndex = (viewerIndex - 1 + currentPhotos.length) % currentPhotos.length;
  updateViewerImage();
});
viewerNext.addEventListener("click", () => {
  viewerIndex = (viewerIndex + 1) % currentPhotos.length;
  updateViewerImage();
});
document.addEventListener("keydown", (e) => {
  if (viewer.hidden) return;
  if (e.key === "Escape") viewer.hidden = true;
  if (e.key === "ArrowLeft") viewerPrev.click();
  if (e.key === "ArrowRight") viewerNext.click();
});
viewerDelete.addEventListener("click", async () => {
  const photo = currentPhotos[viewerIndex];
  if (!photo) return;
  if (!confirm("Delete this photo permanently?")) return;
  try {
    await deleteDoc(doc(db, "photos", photo.id));
    await deleteObject(ref(storage, photo.storagePath));
    viewer.hidden = true;
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Couldn't delete that photo. Please try again.");
  }
});

// ---------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------
signOutBtn.addEventListener("click", () => signOut(auth));
