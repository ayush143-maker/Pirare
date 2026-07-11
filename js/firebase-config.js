// ==========================================================================
// firebase-config.js
// Initializes Firebase and exports the SDK handles used across the app.
//
// NOTE ON SECURITY: the Firebase Web API key below is NOT a secret. Google's
// own docs confirm client API keys only identify your Firebase project to
// Google's servers — they don't grant access to data by themselves. The
// actual security boundary is:
//   1. Firebase Authentication (who is signed in)
//   2. Firestore / Storage Security Rules (what a signed-in user may read/write)
// See README.md for the exact rules this app requires. Never rely on the
// 10-screen puzzle in gatekeeper.js for real protection — it's client-side
// JS and can be read by anyone via view-source. It's a UX layer, not a lock.
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Your web app's Firebase configuration.
// Safe to keep in client code (see note above) — it is not a secret key.
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

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
};
