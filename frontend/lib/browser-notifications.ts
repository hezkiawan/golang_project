// Small helpers for browser (OS) notifications, shown through our display-only
// service worker in public/notification-sw.js. No push / FCM: the page shows them itself.

// true when this browser can show notifications through a service worker.
// Only call this in the browser (inside useEffect or a click handler).
export function browserNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

// We keep the promise in a module variable, so the worker is registered only once,
// even when the bell component mounts again (e.g. moving between the admin and main layouts).
let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

export function registerNotificationWorker(): Promise<ServiceWorkerRegistration> | null {
  if (!browserNotificationsSupported()) {
    return null;
  }
  if (registrationPromise === null) {
    registrationPromise = navigator.serviceWorker.register("/notification-sw.js");
    // if registering fails, allow a later retry instead of keeping a rejected promise
    registrationPromise.catch((err) => {
      console.error("register notification service worker:", err);
      registrationPromise = null;
    });
  }
  return registrationPromise;
}

// The newest createdAt (in ms) we have shown as a browser notification, per user.
// Stored in localStorage, so after a reload we never pop up the same notification again.
// localStorage can be blocked (private mode, site data off) → we just return 0 / skip saving.
function lastPoppedKey(uid: string): string {
  return `notif-last-popped-${uid}`;
}

export function readLastPopped(uid: string): number {
  try {
    const value = Number(localStorage.getItem(lastPoppedKey(uid)));
    return Number.isFinite(value) ? value : 0; // missing key → Number(null) = 0
  } catch {
    return 0;
  }
}

export function writeLastPopped(uid: string, createdAtMs: number) {
  try {
    // only move forward: another tab may already have saved a newer value
    if (createdAtMs > readLastPopped(uid)) {
      localStorage.setItem(lastPoppedKey(uid), String(createdAtMs));
    }
  } catch {
    // storage blocked: the in-memory baseline still protects this page
  }
}

// Show one notification. tag = the notification id, so several open tabs that show
// the same notification replace each other instead of stacking up.
export async function showBrowserNotification(
  notificationId: string,
  title: string,
  body: string,
  url: string
) {
  const promise = registerNotificationWorker();
  if (promise === null) {
    return;
  }
  try {
    const registration = await promise;
    await registration.showNotification(title, {
      body,
      tag: notificationId,
      data: { url },
    });
  } catch (err) {
    console.error("show browser notification:", err);
  }
}
