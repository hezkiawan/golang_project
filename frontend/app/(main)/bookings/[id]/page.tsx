"use client";

import { useParams } from "next/navigation";
import { BookingDetail } from "@/components/booking-detail";

// /bookings/5: the user's view of one of their own bookings
export default function MyBookingDetailPage() {
    const params = useParams<{ id: string }>(); // the [id] part of the url
    return (
        <div>
            <h1 className="mb-6 text-2xl font-semibold">Booking detail</h1>
            <BookingDetail id={params.id} isAdmin={false} />
        </div>
    );
}
