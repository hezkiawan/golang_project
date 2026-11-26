"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/hooks";
import { firebaseAuth, firestoreDb } from "@/lib/firebase";
import {
  browserNotificationsSupported,
  readLastPopped,
  registerNotificationWorker,
  showBrowserNotification,
  writeLastPopped,
} from "@/lib/browser-notifications";
import { cn } from "@/lib/utils";

// the fields of a notifications/{id} document that the dropdown shows
type NotificationItem = {
  id: string;
  bookingId: number;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date | null;
};

// a new notification that may become a browser pop-up
type FreshNotification = {
  id: string;
  bookingId: number;
  title: string;
  body: string;
  createdAtMs: number;
};

// how many notifications one "page" adds to the list
const PAGE_SIZE = 10;

// more new notifications than this in one snapshot → one summary pop-up instead
const BURST_LIMIT = 3;

// a Firestore batch can hold at most 500 writes
const BATCH_LIMIT = 500;

// "just now", "5 min ago", "2 h ago", "3 d ago"
function timeAgo(date: Date | null, now: number): string {
  if (date === null) {
    return "";
  }
  const seconds = Math.floor((now - date.getTime()) / 1000);
  if (seconds < 60) {
    return "just now"; // also covers a slightly-ahead server clock (negative seconds)
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

// "unsupported" = no Notification API or no service workers in this browser
type BrowserPermission = "unsupported" | NotificationPermission;

function readBrowserPermission(): BrowserPermission {
  return browserNotificationsSupported() ? Notification.permission : "unsupported";
}

// the booking detail page for this role
function bookingPath(isAdmin: boolean, bookingId: number): string {
  return isAdmin ? `/admin/bookings/${bookingId}` : `/bookings/${bookingId}`;
}

// A browser notification opens cth"/bookings/5?notification=abc".
// Split that into the page to show ("/bookings/5") and the notification id ("abc").
function splitNotificationUrl(url: string): { path: string; notificationId: string | null } {
  const parsed = new URL(url, window.location.origin);
  const notificationId = parsed.searchParams.get("notification");
  parsed.searchParams.delete("notification");
  return { path: parsed.pathname + parsed.search, notificationId };
}

async function markNotificationRead(notificationId: string) {
  try {
    // only the "read" field, so the security rules allow the update
    // (the rules also refuse ids that belong to someone else)
    await updateDoc(doc(firestoreDb(), "notifications", notificationId), { read: true });
  } catch (err) {
    console.error("mark notification as read:", err);
  }
}

export default function NotificationBell() {
  const me = useAppSelector((state) => state.auth.me); // login / redux
  const router = useRouter();

  // uid of whoever is signed in to Firebase right now (null = nobody)
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null); // firebase login

  const [open, setOpen] = useState(false); //pop over open
  const [unreadCount, setUnreadCount] = useState(0); // badge number (query 1)
  const [items, setItems] = useState<NotificationItem[]>([]); // notification list (query 2)
  const [hasMore, setHasMore] = useState(false); // show "load more"
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE); //how many to show
  const [loading, setLoading] = useState(true); // skeleton
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false); // mark all
  const [now, setNow] = useState(() => Date.now()); // x min ago,  refreshed while the dropdown is open
  // browser notification permission ("unsupported" until we have checked in the browser)
  const [permission, setPermission] = useState<BrowserPermission>("unsupported");

  // Newest createdAt (in ms) we have seen in the list during this session.
  // null = the first SERVER snapshot has not arrived yet (cache snapshots are ignored).
  // Only documents NEWER than this value
  // are "genuinely new" (see the list listener below).
  const newestSeenRef = useRef<number | null>(null);

  // register the service worker once and read the current permission (browser only)
  useEffect(() => {
    registerNotificationWorker();
    setPermission(readBrowserPermission());
  }, []);

  // follow the Firebase sign-in state (the layout signs us in after /api/auth/me)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth(), (user) => {
      setFirebaseUid(user ? user.uid : null);
    });
    return unsubscribe;
  }, []);

  // Only listen when the Firebase user IS the user from our own login.
  // Firebase remembers its session in the browser, so right after a different user logs in,
  // firebaseUid can still be the previous user for a moment. We wait until the layout's
  // signInWithCustomToken has switched it, so we never show someone else's notifications.
  const myUid = me ? String(me.user_id) : null;
  const ready = myUid !== null && firebaseUid === myUid;
  const isAdmin = me?.role === "admin";

  // QUERY 1 -  all my unread notifications → the number on the badge.
  useEffect(() => {
    if (!ready || myUid === null) {
      return;
    }

    const unreadQuery = query(
      collection(firestoreDb(), "notifications"),
      where("recipientId", "==", myUid),
      where("read", "==", false)
    );  
    const stopUnread = onSnapshot(
      unreadQuery,
      (snapshot) => setUnreadCount(snapshot.size),
      (err) => {
        console.error("unread notifications listener:", err);
        setError("Could not load notifications.");
      }
    );

    return () => {
      stopUnread();
      setUnreadCount(0);
    };
  }, [ready, myUid]);

  // live query 2: my latest `pageLimit` notifications → the dropdown list.
  // "Load more" raises the limit of this LIVE query instead of fetching older pages with
  // getDocs + startAfter. That way every item in the list stays live (read state from another
  // tab or "Mark all as read" shows up everywhere), and a new notification can never leave a
  // gap or a duplicate between a live page and a fetched page.
  // We ask for one extra document: if it exists, there is more to load.
  // (needs the composite index recipientId ASC + createdAt DESC from firestore.indexes.json)
  useEffect(() => {
    if (!ready || myUid === null) {
      return;
    }

    const latestQuery = query(
      collection(firestoreDb(), "notifications"),
      where("recipientId", "==", myUid),
      orderBy("createdAt", "desc"),
      limit(pageLimit + 1)
    );
    const stopLatest = onSnapshot(
      latestQuery,
      (snapshot) => {
        // 1. The dropdown list: always updated, also from a cache snapshot
        const list: NotificationItem[] = snapshot.docs.slice(0, pageLimit).map((d) => {
          // "estimate" = never null, even while a server timestamp is still being written
          const data = d.data({ serverTimestamps: "estimate" });
          // mapping each document to react component
          return {
            id: d.id,
            bookingId: data.bookingId,
            title: data.title,
            body: data.body,
            read: data.read === true,
            createdAt: data.createdAt ? data.createdAt.toDate() : null,
          };
        });
        setItems(list);
        setHasMore(snapshot.size > pageLimit);
        setLoading(false);

        // 2. Browser notifications, only for documents that are genuinely new.
        // A snapshot from the local cache can be empty or incomplete (e.g. right after a full
        // page load), so it tells us nothing about what is new. Only server snapshots count.
        if (snapshot.metadata.fromCache) {
          return;
        }

        // - The first server snapshot only sets the baseline (newestSeen): the newest createdAt
        //   in it, or 0 when it is empty (the user really has no notifications yet).
        // - After that, a document is new when it is newer than the baseline. We look at all
        //   docs (not only docChanges), so a doc that first came in a skipped cache snapshot
        //   is not missed. "Load more" brings older docs, which are below the baseline.
        // - We compare Firestore timestamps with each other (not with Date.now()),
        //   so a wrong clock on this computer does not matter.
        // - The baseline also moves up while the tab is visible, so a notification we did
        //   not show then is not shown later.
        const newestSeen = newestSeenRef.current;
        const lastPopped = readLastPopped(myUid); // shown before, maybe before a reload
        let newest = newestSeen ?? 0;
        const fresh: FreshNotification[] = [];
        for (const d of snapshot.docs) {
          const data = d.data({ serverTimestamps: "estimate" });
          const createdAtMs: number = data.createdAt ? data.createdAt.toMillis() : 0;
          if (createdAtMs > newest) {
            newest = createdAtMs;
          }
          const isNew = newestSeen !== null && createdAtMs > newestSeen;
          // already read (e.g. in another tab) or already popped up → never again
          if (isNew && data.read !== true && createdAtMs > lastPopped) {
            fresh.push({ id: d.id, bookingId: data.bookingId, title: data.title, body: data.body, createdAtMs });
          }
        }
        newestSeenRef.current = newest;

        // tab visible → only the in-app bell, no browser notification
        if (fresh.length === 0 || document.visibilityState !== "hidden" || readBrowserPermission() !== "granted") {
          return;
        }

        if (fresh.length > BURST_LIMIT) {
          // many at once: one summary instead of a wall of pop-ups
          showBrowserNotification(
            "summary",
            `You have ${fresh.length} new notifications`,
            "Open your bookings to see them.",
            isAdmin ? "/admin/bookings" : "/bookings"
          );
        } else {
          for (const n of fresh) {
            const path = bookingPath(isAdmin, n.bookingId);
            showBrowserNotification(n.id, n.title, n.body, `${path}?notification=${n.id}`);
          }
        }
        // remember the newest one we showed, so a reload never shows these again
        writeLastPopped(myUid, Math.max(...fresh.map((n) => n.createdAtMs)));
      },
      (err) => {
        // a missing index shows up here; the message contains a link to create it
        console.error("latest notifications listener:", err);
        setError("Could not load notifications.");
        setLoading(false);
      }
    );

    // cleanup: stop the listener. We keep the current items, so "Load more" does not
    // flash the skeleton; the user-switch case is cleared in the effect below.
    return () => {
      stopLatest();
    };
  }, [ready, myUid, pageLimit, isAdmin]);

  // forget this user's data on logout or user switch (the next user starts at page 1)
  useEffect(() => {
    return () => {
      newestSeenRef.current = null; // the next session starts with a fresh "first snapshot"
      setPageLimit(PAGE_SIZE);
      setItems([]);
      setHasMore(false);
      setLoading(true);
      setError("");
    };
  }, [ready, myUid]);

  // keep the "5 min ago" labels fresh while the dropdown is open
  useEffect(() => {
    if (!open) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [open]);

  // Opened from a browser notification with a page load (the service worker used
  // navigate() or openWindow()): the URL ends with ?notification=<id>.
  // Mark it as read and remove the parameter from the address bar.
  useEffect(() => {
    if (!ready) {
      return;
    }
    const { path, notificationId } = splitNotificationUrl(window.location.href);
    if (notificationId !== null) {
      markNotificationRead(notificationId);
      router.replace(path);
    }
  }, [ready, router]);

  // Opened from a browser notification without a page load: the service worker could not
  // navigate this tab, so it sent us the URL and we change the route ourselves.
  useEffect(() => {
    if (!browserNotificationsSupported()) {
      return;
    }
    function handleMessage(event: MessageEvent) {
      if (event.data?.type !== "open-notification") {
        return;
      }
      const { path, notificationId } = splitNotificationUrl(event.data.url);
      if (notificationId !== null && ready) {
        markNotificationRead(notificationId);
      }
      router.push(path);
    }
    navigator.serviceWorker.addEventListener("message", handleMessage);
    navigator.serviceWorker.startMessages(); // deliver messages that arrived before we listened
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [ready, router]);

  // the permission prompt may only be opened from a click
  async function handleEnableBrowserNotifications() {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch (err) {
      console.error("request notification permission:", err);
    }
  }

  async function handleItemClick(item: NotificationItem) {
    if (!me) {
      return;
    }
    if (!item.read) {
      // if this fails we still go to the booking; the item just stays unread
      await markNotificationRead(item.id);
    }
    setOpen(false);
    router.push(bookingPath(isAdmin, item.bookingId));
  }

  async function handleMarkAllRead() {
    if (!ready || myUid === null) {
      return;
    }
    setMarking(true);
    setError("");
    try {
      const db = firestoreDb();
      // ALL my unread notifications, not only the ones visible in the list
      const unreadQuery = query(
        collection(db, "notifications"),
        where("recipientId", "==", myUid),
        where("read", "==", false)
      );
      const snapshot = await getDocs(unreadQuery);

      // one batch per 500 documents (Firestore's batch limit)
      for (let start = 0; start < snapshot.docs.length; start += BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const d of snapshot.docs.slice(start, start + BATCH_LIMIT)) {
          batch.update(d.ref, { read: true }); // only "read", so the rules allow it
        }
        await batch.commit();
      }
    } catch (err) {
      console.error("mark all as read:", err);
      setError("Could not mark notifications as read.");
    } finally {
      setMarking(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          // the user may have changed it in the site settings meanwhile
          setPermission(readBrowserPermission());
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
          />
        }
      >
        <Bell />
        {ready && unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <div className="flex items-center justify-between gap-2 px-1">
          <PopoverTitle>Notifications</PopoverTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={!ready || marking || unreadCount === 0}
          >
            {marking ? "Marking..." : "Mark all as read"}
          </Button>
        </div>

        {/* browser notifications: nothing is shown when granted or unsupported */}
        {permission === "default" && (
          <Button variant="outline" size="sm" className="w-full" onClick={handleEnableBrowserNotifications}>
            Enable browser notifications
          </Button>
        )}
        {permission === "denied" && (
          <p className="px-1 text-xs text-muted-foreground">
            Browser notifications are blocked. You can allow them in your browser&apos;s site settings.
          </p>
        )}

        {/* loading → error → empty → list */}
        {!ready || loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error !== "" ? (
          <p className="px-1 py-4 text-center text-muted-foreground">{error}</p>
        ) : items.length === 0 ? (
          <p className="px-1 py-4 text-center text-muted-foreground">No notifications yet</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className={cn(
                      "flex w-full gap-2 rounded-md px-2 py-2 text-left hover:bg-muted",
                      !n.read && "bg-primary/5"
                    )}
                  >
                    {/* unread dot; a same-size empty space keeps read items aligned */}
                    <span
                      className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", !n.read && "bg-primary")}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={n.read ? "font-normal" : "font-semibold"}>
                          {!n.read && <span className="sr-only">Unread: </span>}
                          {n.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {timeAgo(n.createdAt, now)}
                        </span>
                      </span>
                      <span className="block text-muted-foreground">{n.body}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 w-full"
                onClick={() => setPageLimit(pageLimit + PAGE_SIZE)}
              >
                Load more
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
