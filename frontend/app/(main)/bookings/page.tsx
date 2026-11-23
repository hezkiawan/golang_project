"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { RowsSkeleton, TableRowsSkeleton } from "@/components/loading-skeletons";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { changeBookingStatus, fetchMyBookings } from "@/lib/features/bookings/bookingSlice";
import { fetchServices } from "@/lib/features/services/serviceSlice";

export default function BookingsPage() {
    // GLOBAL STATE
    const dispatch = useAppDispatch();
    const updatingId = useAppSelector((s) => s.bookings.updatingId);
    const bookings = useAppSelector((state) => state.bookings.items);
    const services = useAppSelector((state) => state.services.items);
    const loadStatus = useAppSelector((state) => state.bookings.loadStatus);

    // LOCAL STATE
    const [message, setMessage] = useState("");

    // async function loadBookings() {
    //     const res = await fetch("/api/bookings/me");
    //     const data = await res.json();
    //     setBookings(data);
    //     setLoading(false);
    // }

    useEffect(() => {
        dispatch(fetchMyBookings())

        // also load services so we can show names instead of "service 1"
        dispatch(fetchServices())
    }, [dispatch]);

    // find the service name for an id, fall back to "Service #id"
    function getServiceName(id: number) {
        const s = services.find((s) => s.id === id);
        return s ? s.name : "Service #" + id;
    }

    const showSkeleton = (loadStatus === "idle" || loadStatus === "loading") && bookings.length === 0;

    // users can only cancel; approving/rejecting is the admin's job
    async function handleCancel(id: number) {
        try {
            const updated = await dispatch(changeBookingStatus({ id: id, action: "cancel" })).unwrap();
            setMessage("Booking #" + id + " is now " + updated.status + ".");
        } catch (err) {
            setMessage(err as string); // Go's error text, e.g. not allowed
        }
    }

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-semibold">My bookings</h1>
                <p className="text-sm text-muted-foreground">An admin approves or rejects each booking. You can cancel one while it is still pending.</p>
            </div>

            {message && <p className="mb-4 text-sm text-muted-foreground">{message}</p>}


            <div className="rounded-md border">
                <Table>
                    {/* headers: always visible */}
                    <TableHeader>
                        <TableRow>
                            <TableHead className="hidden sm:table-cell">#</TableHead>
                            <TableHead>Service</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>

                    <TableBody>
                        {showSkeleton ? (
                            // 1. loading: placeholder rows, same 5 columns, # hidden on phones like the real one
                            <TableRowsSkeleton columns={["hidden sm:table-cell", "", "", "", ""]} />
                        ) : bookings.length === 0 ? (
                            // 2. loaded but empty
                            <TableRow>
                                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                    No bookings yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            // 3. loaded with data: your existing rows, unchanged
                            bookings.map((b, i) => (
                                <TableRow key={b.id}>
                                    <TableCell className="hidden sm:table-cell">{i + 1}</TableCell>
                                    <TableCell className="font-medium">
                                        {/* the service name opens the detail page */}
                                        <Link href={"/bookings/" + b.id} className="underline-offset-4 hover:underline">
                                            {b.service_name || getServiceName(b.service_id)}
                                        </Link>
                                    </TableCell>
                                    <TableCell>{b.booking_date}</TableCell>
                                    <TableCell>
                                        <StatusBadge status={b.status} />
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-2">
                                            {/* same rule as the SQL: only a pending booking can be cancelled */}
                                            {b.status === "pending" && (
                                                <Button size="sm" variant="outline" disabled={updatingId === b.id} onClick={() => handleCancel(b.id)}>
                                                    Cancel
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div >
    );
}