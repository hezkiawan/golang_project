import { Badge } from "@/components/ui/badge";

// colored badge per booking status, used by My Bookings and Admin Bookings
export function StatusBadge({ status }: { status: string }) {
    if (status === "confirmed") {
        return <Badge className="bg-green-100 text-green-800">confirmed</Badge>;
    }
    if (status === "pending") {
        return <Badge className="bg-yellow-100 text-yellow-800">pending</Badge>;
    }
    return (
        <Badge variant="outline" className="text-muted-foreground">
            cancelled
        </Badge>
    );
}