"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { clearMe, setMe, type Me } from "@/lib/features/auth/authSlice";
import { signInToFirebase, signOutOfFirebase, startFirebaseAuth } from "@/lib/firebase";

// which layout uses the hook: "user" = app/(main), "admin" = app/admin
type Area = "user" | "admin";

// how long logout waits for our backend before it goes to /login anyway
const LOGOUT_TIMEOUT_MS = 5000;

// The session check and logout shared by both layouts.
export function useSession(area: Area) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const me = useAppSelector((state) => state.auth.me); // null until /api/auth/me answered

  const [loggingOut, setLoggingOut] = useState(false); // for the "Logging out…" button
  // the same flag as a ref: it is set at once, so a second click in the same render does nothing
  const loggingOutRef = useRef(false);

  // When the layout opens, ask the backend who is logged in.
  useEffect(() => {
    // start Firebase Auth now, so its startup runs at the same time as /api/auth/me
    startFirebaseAuth();

    // aborted on cleanup (also when dev mode runs this effect twice: only one answer is used)
    const controller = new AbortController();

    fetch("/api/auth/me", { signal: controller.signal })
      .then(async (res) => {
        if (loggingOutRef.current) {
          return; // a late answer must not log the user back in
        }
        if (!res.ok) {
          router.push("/login"); // not logged in
          return;
        }
        const data: Me = await res.json();
        if (controller.signal.aborted || loggingOutRef.current) {
          return;
        }
        if (area === "user" && data.role === "admin") {
          router.push("/admin/services"); // admins have their own pages
          return;
        }
        if (area === "admin" && data.role !== "admin") {
          router.push("/"); // logged in, but not an admin
          return;
        }
        dispatch(setMe(data));
        // also sign in to Firebase (for the live notification bell). If it fails,
        // the rest of the app still works, so we only log the error.
        signInToFirebase(data.user_id).catch((err) => console.error("firebase sign-in failed:", err));
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") {
          return; // cancelled by the cleanup
        }
        console.error("session check failed:", err);
      });

    return () => controller.abort();
  }, [area, dispatch, router]);

  // Logout does not wait for Firebase: Firebase's signOut waits until Auth has finished
  // starting up (network requests to Google), which can take seconds right after a page load.
  async function logout() {
    if (loggingOutRef.current) {
      return; // already logging out
    }
    loggingOutRef.current = true;
    setLoggingOut(true);

    // forget the Firebase session too (so the next user doesn't inherit it), in the background
    signOutOfFirebase().catch((err) => console.error("firebase sign-out failed:", err));

    // our own backend clears the JWT cookie. The header and the "Logging out…" button
    // stay visible until it answers. If it fails or is too slow, we still continue.
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        signal: AbortSignal.timeout(LOGOUT_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.error("logout failed: status", res.status);
      }
    } catch (err) {
      console.error("logout request failed:", err);
    }

    dispatch(clearMe()); // forget the user (the bell stops listening right away)
    router.push("/login");
  }

  return { me, loggingOut, logout };
}
