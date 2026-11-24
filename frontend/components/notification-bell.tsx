"use client";

import { useEffect, useState } from "react";
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

// how many notifications one "page" adds to the list
const PAGE_SIZE = 10;

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

export default function NotificationBell() {
  const me = useAppSelector((state) => state.auth.me);
  const router = useRouter();

  // uid of whoever is signed in to Firebase right now (null = nobody)
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);
  // "now" for the relative timestamps, refreshed while the dropdown is open
  const [now, setNow] = useState(() => Date.now());

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

  // live query 1: all my unread notifications → the number on the badge.
  // Its own effect, so "Load more" (which changes pageLimit) does not restart it.
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
        const list: NotificationItem[] = snapshot.docs.slice(0, pageLimit).map((d) => {
          // "estimate" = never null, even while a server timestamp is still being written
          const data = d.data({ serverTimestamps: "estimate" });
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
  }, [ready, myUid, pageLimit]);

  // forget this user's data on logout or user switch (the next user starts at page 1)
  useEffect(() => {
    return () => {
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

  async function handleItemClick(item: NotificationItem) {
    if (!me) {
      return;
    }
    if (!item.read) {
      try {
        // only the "read" field, so the security rules allow the update
        await updateDoc(doc(firestoreDb(), "notifications", item.id), { read: true });
      } catch (err) {
        // still go to the booking; the item just stays unread
        console.error("mark notification as read:", err);
      }
    }
    setOpen(false);
    const path = me.role === "admin" ? `/admin/bookings/${item.bookingId}` : `/bookings/${item.bookingId}`;
    router.push(path);
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
    <Popover open={open} onOpenChange={(nextOpen) => setOpen(nextOpen)}>
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
