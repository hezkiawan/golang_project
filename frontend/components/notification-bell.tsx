"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/hooks";
import { firebaseAuth, firestoreDb } from "@/lib/firebase";

// the fields of a notifications/{id} document that the dropdown shows (M5 adds read state + time)
type NotificationItem = {
  id: string;
  title: string;
  body: string;
};

export default function NotificationBell() {
  const me = useAppSelector((state) => state.auth.me);

  // uid of whoever is signed in to Firebase right now (null = nobody)
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);

  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  useEffect(() => {
    if (!ready || myUid === null) {
      return;
    }

    const db = firestoreDb();
    const notifications = collection(db, "notifications");

    // live query 1: all my unread notifications → the number on the badge
    const unreadQuery = query(notifications, where("recipientId", "==", myUid), where("read", "==", false));
    const stopUnread = onSnapshot(
      unreadQuery,
      (snapshot) => setUnreadCount(snapshot.size),
      (err) => {
        console.error("unread notifications listener:", err);
        setError("Could not load notifications.");
      }
    );

    // live query 2: my latest 10 notifications → the dropdown list
    // (needs the composite index recipientId ASC + createdAt DESC from firestore.indexes.json)
    const latestQuery = query(notifications, where("recipientId", "==", myUid), orderBy("createdAt", "desc"), limit(10));
    const stopLatest = onSnapshot(
      latestQuery,
      (snapshot) => {
        const list: NotificationItem[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          title: doc.data().title,
          body: doc.data().body,
        }));
        setItems(list);
        setLoading(false);
      },
      (err) => {
        // a missing index shows up here; the message contains a link to create it
        console.error("latest notifications listener:", err);
        setError("Could not load notifications.");
        setLoading(false);
      }
    );

    // cleanup: stop both listeners and forget this user's data (logout or user switch)
    return () => {
      stopUnread();
      stopLatest();
      setUnreadCount(0);
      setItems([]);
      setLoading(true);
      setError("");
    };
  }, [ready, myUid]);

  return (
    <Popover>
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
        <PopoverTitle className="px-1">Notifications</PopoverTitle>

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
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map((n) => (
              <li key={n.id} className="px-1 py-2">
                <p className="font-medium">{n.title}</p>
                <p className="text-muted-foreground">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
