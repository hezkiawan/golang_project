"use client";

import { useEffect, useState } from "react";
import { RowsSkeleton } from "@/components/loading-skeletons";

// same shape as the Notification struct in internal/notification/model.go
type Notification = {
    id: number;
    booking_id: number;
    message: string;
    created_at: string;
};

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/notifications/me")
            .then((res) => res.json())
            .then((data) => {
                setNotifications(data);
                setLoading(false);
            })
    }, []);

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-semibold">Notifications</h1>
                <p className="text-sm text-muted-foreground">Your booking activity.</p>
            </div>


            {loading ? (
                <RowsSkeleton />
            ) : notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notifications yet.</p>
            ) : (
                <div className="divide-y rounded-md border">
                    {notifications.map((n) => (
                        <div key={n.id} className="p-4">
                            <p className="text-sm">{n.message}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{n.created_at.slice(0, 19).replace("T", " ")}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>

    )
}
