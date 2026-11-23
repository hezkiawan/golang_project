"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BOOKING_STATUSES, StatusBadge } from "@/components/status-badge";
import { TableRowsSkeleton } from "@/components/loading-skeletons";
import { SortHeader } from "@/components/data-table/sort-header";
import { TablePagination } from "@/components/data-table/table-pagination";
import { CheckboxFilter } from "@/components/checkbox-filter";

// same shape as Booking in internal/booking/model.go (GET /bookings/me always fills service_name)
type MyBooking = {
    id: number;
    service_id: number;
    service_name: string;
    booking_date: string;
    status: string;
    created_at: string;
};

export default function BookingsPage() {
    const router = useRouter();

    // the current page of data: local state, only this page uses it
    const [bookings, setBookings] = useState<MyBooking[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    // table controls
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sort, setSort] = useState("booking_date"); // default: booking date,
    const [order, setOrder] = useState<"asc" | "desc">("desc"); // newest first
    const [statuses, setStatuses] = useState<string[]>(BOOKING_STATUSES); // all ticked = no filter

    // the table: every time a control changes
    useEffect(() => {
        // lets the cleanup cancel this request if the controls change before it finishes
        const controller = new AbortController();
        setLoading(true);

        const params = new URLSearchParams({
            page: String(page),
            limit: String(limit),
            sort: sort,
            order: order,
        });
        if (statuses.length < BOOKING_STATUSES.length) params.set("status", statuses.join(","));

        async function loadBookings() {
            try {
                const res = await fetch("/api/bookings/me?" + params.toString(), { signal: controller.signal });
                if (res.ok) {
                    const data = await res.json();
                    setBookings(data.data ?? []);
                    setTotal(data.total ?? 0);
                }
                setLoading(false);
            } catch (err) {
                // we cancelled this request ourselves: a newer one is already running
                if (err instanceof Error && err.name === "AbortError") return;
                setLoading(false);
            }
        }
        loadBookings();

        // cleanup: React runs this when a control changes (or the page closes)
        return () => {
            controller.abort();
        };
    }, [page, limit, sort, order, statuses]);

    // two-step sort: a new column starts ascending, the same column flips asc <-> desc.
    // (no "unsorted" step: the default IS "date, newest first", so it is always visible)
    function handleSort(column: string) {
        if (sort !== column) {
            setSort(column);
            setOrder("asc");
        } else {
            setOrder(order === "asc" ? "desc" : "asc");
        }
        setPage(1); // a new order → start from page 1
    }

    function openBooking(id: number) {
        router.push("/bookings/" + id);
    }

    const from = (page - 1) * limit + 1;
    const isFiltering = statuses.length < BOOKING_STATUSES.length;

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-semibold">My bookings</h1>
                <p className="text-sm text-muted-foreground">
                    An admin approves or rejects each booking. Open a booking to see its details or cancel it while it is pending.
                </p>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="hidden w-16 sm:table-cell">No.</TableHead>
                            <TableHead>
                                <SortHeader label="Service" column="service_name" sort={sort} order={order} onSort={handleSort} />
                            </TableHead>
                            <TableHead>
                                <SortHeader label="Date" column="booking_date" sort={sort} order={order} onSort={handleSort} />
                            </TableHead>
                            <TableHead>
                                <div className="flex items-center gap-1">
                                    <SortHeader label="Status" column="status" sort={sort} order={order} onSort={handleSort} />
                                    <CheckboxFilter
                                        label="Filter status"
                                        options={BOOKING_STATUSES}
                                        selected={statuses}
                                        onChange={(value) => {
                                            setStatuses(value);
                                            setPage(1);
                                        }}
                                    />
                                </div>
                            </TableHead>
                            <TableHead className="hidden md:table-cell">
                                <SortHeader label="Booked on" column="created_at" sort={sort} order={order} onSort={handleSort} />
                            </TableHead>
                        </TableRow>
                    </TableHeader>

                    <TableBody>
                        {loading ? (
                            // 1. loading: placeholder rows, same 5 columns, hidden on the same screen sizes
                            <TableRowsSkeleton columns={["hidden sm:table-cell", "", "", "", "hidden md:table-cell"]} />
                        ) : bookings.length === 0 ? (
                            // 2. loaded but empty
                            <TableRow>
                                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                    {isFiltering ? "No bookings match your filters." : "No bookings yet."}
                                </TableCell>
                            </TableRow>
                        ) : (
                            // 3. loaded with data: click (or Enter on) a row to open the detail page
                            bookings.map((b, i) => (
                                <TableRow
                                    key={b.id}
                                    className="cursor-pointer"
                                    tabIndex={0}
                                    onClick={() => openBooking(b.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") openBooking(b.id);
                                    }}
                                >
                                    <TableCell className="hidden sm:table-cell">{from + i}</TableCell>
                                    <TableCell className="font-medium">{b.service_name}</TableCell>
                                    <TableCell>{b.booking_date}</TableCell>
                                    <TableCell>
                                        <StatusBadge status={b.status} />
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell">{new Date(b.created_at).toLocaleDateString()}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <TablePagination
                page={page}
                limit={limit}
                total={total}
                onPageChange={setPage}
                onLimitChange={(value) => {
                    setLimit(value);
                    setPage(1);
                }}
            />
        </div>
    );
}
