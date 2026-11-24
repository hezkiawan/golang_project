"use client";

import { useParams } from "next/navigation";
import { BookingDetail } from "@/components/booking-detail";

// /admin/bookings/5: the admin can see any booking and approve/reject it
export default function AdminBookingDetailPage() {
    const params = useParams<{ id: string }>(); // the [id] part of the url
    return (
        <div>
            <h1 className="mb-6 text-2xl font-semibold">Booking detail</h1>
            <BookingDetail id={params.id} isAdmin={true} />
        </div>
    );
}
