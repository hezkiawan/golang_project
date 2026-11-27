import { Badge } from "@/components/ui/badge";

// every booking status, in the order the status filters show them (same list as the Go whitelist)
export const BOOKING_STATUSES = ["pending", "confirmed", "cancelled", "rejected"];

// colored badge per booking status, used by My Bookings, Admin Bookings and the detail page
export function StatusBadge({ status }: { status: string }) {
    if (status === "confirmed") {
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">confirmed</Badge>;
    }
    if (status === "pending") {
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">pending</Badge>;
    }
    if (status === "rejected") {
        // an admin said no: red, so it stands out from a normal cancel
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">rejected</Badge>;
    }
    return (
        <Badge variant="outline" className="text-muted-foreground">
            cancelled
        </Badge>
    );
}
