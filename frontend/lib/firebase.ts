import { FirebaseError, getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
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

let pageIsUnloading = false;
// apakah kita inside the browser
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    //leaving page
    pageIsUnloading = true;
  });
  // coming back from the back/forward cache: the page is alive again
  window.addEventListener("pageshow", () => {
    pageIsUnloading = false;
  });
}

// the sign-in that is running right now (null = none)
let pendingSignIn: { uid: string; promise: Promise<void> } | null = null;

// We log in with our own Go JWT (cookie). Firestore doesn't know that JWT, so we ask the
// user service for a Firebase custom token (uid = our user id) and sign in to Firebase with it.
//
// Both layouts call this (and dev mode runs effects twice), so calls for the same user
// share ONE running sign-in instead of each fetching a token.
export function signInToFirebase(userId: number): Promise<void> {
  const uid = String(userId);
  if (pendingSignIn !== null && pendingSignIn.uid === uid) {
    return pendingSignIn.promise;
  }

  //If someone else is still signing in...wait.
  // A sign-in for a different user is still running: wait for it to finish first,
  // so it cannot finish last and leave the wrong user signed in.
  const previous = pendingSignIn !== null ? pendingSignIn.promise.catch(() => {}) : Promise.resolve();

  const promise: Promise<void> = previous
    .then(() => doSignIn(uid))
    .catch((err) => {
      // cut off because the page is going away → not an error worth logging
      if (pageIsUnloading || (err instanceof Error && err.name === "AbortError")) {
        return;
      }
      throw err;
    })
    .finally(() => {
      // only clear it if no newer sign-in has replaced it meanwhile
      if (pendingSignIn !== null && pendingSignIn.promise === promise) {
        pendingSignIn = null;
      }
    });

  pendingSignIn = { uid, promise };
  return promise;
}

async function doSignIn(uid: string) {
  const auth = firebaseAuth();

  // Firebase keeps its session in the browser. Wait until it has loaded it:
  // on a normal page load we are already signed in as this user and need no new token.
  await auth.authStateReady();
  if (auth.currentUser?.uid === uid) {
    return;
  }

  const res = await fetch("/api/auth/firebase-token");
  if (!res.ok) {
    throw new Error("could not get a firebase token");
  }
  const data: { token: string } = await res.json();

  try {
    await signInWithCustomToken(auth, data.token);
  } catch (err) {
    // a short network hiccup: try once more with the same token (it is valid for an hour)
    if (err instanceof FirebaseError && err.code === "auth/network-request-failed") {
      await signInWithCustomToken(auth, data.token);
      return;
    }
    throw err;
  }
}

// on logout: forget the Firebase session too, so the next user doesn't inherit it
export async function signOutOfFirebase() {
  await signOut(firebaseAuth());
}
