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

// the sign-out that is running right now (null = none). A new sign-in waits for it.
let pendingSignOut: Promise<void> | null = null;

// How many times signOutOfFirebase has run. A sign-in remembers the value it started with;
// if the value changed meanwhile, a logout happened and that sign-in is cancelled.
let signOutCount = 0;

// Start Firebase Auth's startup (it reads its saved session and checks it with Google)
// as early as possible, so it runs at the same time as our own /api/auth/me request.
// If it fails, the rest of the app still works, so we only log the error.
export function startFirebaseAuth() {
  try {
    firebaseAuth();
  } catch (err) {
    console.error("firebase auth start failed:", err);
  }
}

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

  const generation = signOutCount;

  //If someone else is still signing in...wait.
  // A sign-in for a different user is still running: wait for it to finish first,
  // so it cannot finish last and leave the wrong user signed in.
  const previousSignIn = pendingSignIn !== null ? pendingSignIn.promise.catch(() => {}) : Promise.resolve();
  // A sign-out is still running (logout, then a quick re-login): wait for it too,
  // so it cannot finish after this sign-in and sign the new user out again.
  const previousSignOut = pendingSignOut !== null ? pendingSignOut.catch(() => {}) : Promise.resolve();

  const promise: Promise<void> = Promise.all([previousSignIn, previousSignOut])
    .then(() => doSignIn(uid, generation))
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

async function doSignIn(uid: string, generation: number) {
  // true once a logout happened after this sign-in started
  const loggedOutMeanwhile = () => signOutCount !== generation;
  const auth = firebaseAuth();

  // Firebase keeps its session in the browser. Wait until it has loaded it:
  // on a normal page load we are already signed in as this user and need no new token.
  await auth.authStateReady();
  if (loggedOutMeanwhile() || auth.currentUser?.uid === uid) {
    return;
  }

  const res = await fetch("/api/auth/firebase-token");
  if (!res.ok) {
    throw new Error("could not get a firebase token");
  }
  const data: { token: string } = await res.json();

  // logged out while we were getting the token: don't sign in at all
  if (loggedOutMeanwhile()) {
    return;
  }

  try {
    await signInWithCustomToken(auth, data.token);
  } catch (err) {
    // a short network hiccup: try once more with the same token (it is valid for an hour)
    const networkHiccup = err instanceof FirebaseError && err.code === "auth/network-request-failed";
    if (!networkHiccup) {
      throw err;
    }
    if (loggedOutMeanwhile()) {
      return; // nobody was signed in, and nobody wants to be anymore
    }
    await signInWithCustomToken(auth, data.token);
  }

  // Logged out while signInWithCustomToken was running: the logout's signOut finished first,
  // and then this sign-in signed the user in again. Sign out once more.
  if (loggedOutMeanwhile()) {
    await signOut(auth);
  }
}

// On logout: forget the Firebase session too, so the next user doesn't inherit it.
// The layouts don't wait for this: Firebase's signOut waits until Auth has finished starting
// up (network requests to Google), and logout should not wait for that.
export function signOutOfFirebase(): Promise<void> {
  // cancel a sign-in that is still running (doSignIn sees the new count)
  signOutCount++;
  const cancelledSignIn = pendingSignIn !== null ? pendingSignIn.promise.catch(() => {}) : Promise.resolve();
  pendingSignIn = null;

  let signOutDone: Promise<void>;
  try {
    signOutDone = signOut(firebaseAuth());
  } catch (err) {
    signOutDone = Promise.reject(err);
  }

  // Done when the sign-out AND the cancelled sign-in have both finished: the cancelled
  // sign-in may still sign out once more (see doSignIn), and a new sign-in waits for this
  // promise, so that extra sign-out can never hit the next user.
  // Rejects only when the sign-out itself failed.
  const promise: Promise<void> = Promise.all([signOutDone.catch(() => {}), cancelledSignIn])
    .then(() => signOutDone)
    .finally(() => {
      if (pendingSignOut === promise) {
        pendingSignOut = null;
      }
    });
  pendingSignOut = promise;
  return promise;
}
