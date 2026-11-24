"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";

// same shape as BookingDetail in internal/booking/model.go
type BookingDetailData = {
    id: number;
    user_id: number;
    username: string;
    service_id: number;
    service_name: string;
    booking_date: string;
    status: string;
    created_at: string;
};

// one component for both pages: /bookings/[id] (user) and /admin/bookings/[id] (admin)
export function BookingDetail({ id, isAdmin }: { id: string; isAdmin: boolean }) {
    const [booking, setBooking] = useState<BookingDetailData | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const [busy, setBusy] = useState(false); // a button is waiting for the server
    const [message, setMessage] = useState("");
    const [isError, setIsError] = useState(false);

    const backHref = isAdmin ? "/admin/bookings" : "/bookings";

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setNotFound(false);

        async function loadBooking() {
            try {
                const res = await fetch("/api/bookings/" + id, { signal: controller.signal });
                if (res.ok) {
                    setBooking(await res.json());
                } else {
                    // 404 = doesn't exist or not yours, 400 = id is not a number: both mean "nothing to show"
                    setNotFound(true);
                }
                setLoading(false);
            } catch (err) {
                if (err instanceof Error && err.name === "AbortError") return;
                setNotFound(true);
                setLoading(false);
            }
        }
        loadBooking();

        return () => {
            controller.abort();
        };
    }, [id]);

    // action = "confirm" | "reject" (admin) or "cancel" (user)
    async function changeStatus(action: "confirm" | "reject" | "cancel") {
        if (booking === null) return;
        setBusy(true);
        try {
            const res = await fetch("/api/bookings/" + booking.id + "/" + action, { method: "POST" });
            if (res.ok) {
                const updated = await res.json();
                // the answer has no names, so only take the new status
                setBooking({ ...booking, status: updated.status });
                // green only for approve; rejected / cancelled are shown in red so they stand out
                setIsError(updated.status !== "confirmed");
                setMessage("Booking is now " + updated.status + ".");
            } else {
                // 409 = someone else changed it first (e.g. another admin)
                const data = await res.json().catch(() => ({}));
                setIsError(true);
                setMessage(data.error || "Something went wrong");
            }
        } catch {
            setIsError(true);
            setMessage("Could not reach the server");
        }
        setBusy(false);
    }

    // 1. loading
    if (loading) {
        return (
            <div className="max-w-xl space-y-3 rounded-xl border p-6">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
            </div>
        );
    }

    // 2. not found (or not yours)
    if (notFound || booking === null) {
        return (
            <div className="max-w-xl space-y-4">
                <p className="text-muted-foreground">Booking not found.</p>
                <Link href={backHref} className="text-sm text-muted-foreground hover:underline">
                    ← Back to bookings
                </Link>
            </div>
        );
    }

    // 3. data
    return (
        <div className="max-w-xl space-y-4">
            <Link href={backHref} className="text-sm text-muted-foreground hover:underline">
                ← Back to bookings
            </Link>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                        <span>Booking #{booking.id}</span>
                        <StatusBadge status={booking.status} />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                        <dt className="text-muted-foreground">Service</dt>
                        <dd className="font-medium">{booking.service_name}</dd>

                        <dt className="text-muted-foreground">Date</dt>
                        <dd>{booking.booking_date}</dd>

                        <dt className="text-muted-foreground">User</dt>
                        <dd>{booking.username}</dd>

                        <dt className="text-muted-foreground">Created</dt>
                        <dd>{new Date(booking.created_at).toLocaleString()}</dd>
                    </dl>

                    {/* buttons only make sense while the booking is still pending */}
                    {booking.status === "pending" && (
                        <div className="mt-6 flex gap-2">
                            {isAdmin ? (
                                <>
                                    <Button disabled={busy} onClick={() => changeStatus("confirm")}>
                                        Approve
                                    </Button>
                                    <Button variant="destructive" disabled={busy} onClick={() => changeStatus("reject")}>
                                        Reject
                                    </Button>
                                </>
                            ) : (
                                <Button variant="outline" disabled={busy} onClick={() => changeStatus("cancel")}>
                                    Cancel booking
                                </Button>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {message && (
                <p
                    className={
                        isError
                            ? "rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
                            : "rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800"
                    }
                >
                    {message}
                </p>
            )}
        </div>
    );
}
