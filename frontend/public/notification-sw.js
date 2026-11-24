// HomeFix service worker: ONLY used to show browser notifications and handle clicks on them.
// No push, no FCM, no caching. The page itself decides when to show a notification
// (see components/notification-bell.tsx); this file reacts when the user clicks one.

// A new worker normally waits until every old tab is closed before it activates.
// skipWaiting() lets it activate right away.
self.addEventListener("install", () => {
  self.skipWaiting();
});

// A page that was opened BEFORE the worker existed is not "controlled" by it.
// clients.claim() takes control of the already-open pages, so client.navigate() below
// works on the very first visit, without a reload.
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  // absolute URL on our own origin (data.url is a path like /bookings/5?notification=abc)
  const url = new URL(data.url || "/", self.location.origin).href;

  event.waitUntil(openApp(url));
});

async function openApp(url) {
  // includeUncontrolled: also find tabs that this worker does not control (yet)
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const appWindow = windows.find((client) => new URL(client.url).origin === self.location.origin);

  // no tab of the app is open → open a new one
  if (!appWindow) {
    await self.clients.openWindow(url);
    return;
  }

  await appWindow.focus();

  // navigate() only works on a page this worker controls (it throws otherwise)
  try {
    const navigated = await appWindow.navigate(url);
    if (navigated) {
      return;
    }
  } catch (err) {
    // fall through to postMessage
  }

  // the page listens for this message and does router.push(url) itself
  appWindow.postMessage({ type: "open-notification", url });
}
