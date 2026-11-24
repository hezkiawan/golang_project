import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInWithCustomToken, signOut, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// values come from frontend/.env.local (see frontend/.env.example)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// We create the app the first time someone needs it (not when this file is imported).
// Reason: Next.js also renders client components on the server during the build, and
// getAuth() throws there if the env vars are missing. Our helpers are only called
// inside useEffect / click handlers, which run in the browser.
function getFirebaseApp(): FirebaseApp {
  // getApps() is not empty after the first call (also after a hot reload), so we reuse the app
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

export function firebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function firestoreDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

// We log in with our own Go JWT (cookie). Firestore doesn't know that JWT, so we ask the
// user service for a Firebase custom token (uid = our user id) and sign in to Firebase with it.
export async function signInToFirebase() {
  const res = await fetch("/api/auth/firebase-token");
  if (!res.ok) {
    throw new Error("could not get a firebase token");
  }
  const data: { token: string } = await res.json();
  await signInWithCustomToken(firebaseAuth(), data.token);
}

// on logout: forget the Firebase session too, so the next user doesn't inherit it
export async function signOutOfFirebase() {
  await signOut(firebaseAuth());
}
