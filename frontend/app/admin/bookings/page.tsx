"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableRowsSkeleton } from "@/components/loading-skeletons";
import { SortHeader } from "@/components/data-table/sort-header";
import { TablePagination } from "@/components/data-table/table-pagination";
import { CheckboxFilter } from "@/components/checkbox-filter";
import { ColumnSearch } from "@/components/data-table/column-search";
import { useDebounce } from "@/lib/use-debounce";

// same shape as AdminBooking in internal/booking/model.go
type AdminBooking = {
    id: number;
    user_id: number;
    username: string;
    service_id: number;
    service_name: string;
    booking_date: string;
    status: string;
};


const STATUSES = ["pending", "confirmed", "cancelled", "rejected"];

export default function AdminBookingsPage() {
    // data from the server
    const [bookings, setBookings] = useState<AdminBooking[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);


    // table controls
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sort, setSort] = useState("");
    const [order, setOrder] = useState<"asc" | "desc">("asc");
    const [statuses, setStatuses] = useState<string[]>(STATUSES); // all ticked = no filter
    const [date, setDate] = useState(""); // "" = any date
    const [userSearch, setUserSearch] = useState("");
    const [serviceSearch, setServiceSearch] = useState("");
    const debouncedUser = useDebounce(userSearch, 400);
    const debouncedService = useDebounce(serviceSearch, 400);


    // the table: every time a control changes
    useEffect(() => {
        // lets the cleanup cancel this request if the filters change before it finishes
        const controller = new AbortController();
        setLoading(true);

        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (sort !== "") {
            params.set("sort", sort);
            params.set("order", order);
        }
        if (statuses.length < STATUSES.length) params.set("status", statuses.join(","));
        if (date !== "") params.set("date", date);

        if (debouncedUser.trim() !== "") params.set("username", debouncedUser.trim());
        if (debouncedService.trim() !== "") params.set("service", debouncedService.trim());

        async function loadBookings() {
            try {
                const res = await fetch("/api/bookings?" + params.toString(), { signal: controller.signal });
                if (res.ok) {
                    const data = await res.json(); // also cancelled by the signal
                    setBookings(data.data ?? []);
                    setTotal(data.total ?? 0);
                }
                setLoading(false);
            } catch (err) {
                // we cancelled this request ourselves: a newer one is already running
                if (err instanceof Error && err.name === "AbortError") return;
                setLoading(false); // a real network error: don't leave the skeleton forever
            }
        }
        loadBookings();

        // cleanup: React runs this when a filter changes (or the page closes)
        return () => {
            controller.abort();
        };
    }, [page, limit, sort, order, statuses, date, debouncedUser, debouncedService]);

    function handleSort(column: string) {
        if (sort !== column) {
            setSort(column);
            setOrder("asc");
        } else if (order === "asc") {
            setOrder("desc");
        } else {
            setSort("");
            setOrder("asc");
        }
        setPage(1);
    }

    const from = (page - 1) * limit + 1;
    const isFiltering = statuses.length < STATUSES.length || date !== "" || userSearch !== "" || serviceSearch !== "";

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-semibold">All bookings</h1>
                <p className="text-sm text-muted-foreground">Bookings from all users.</p>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-16 py-2 align-top">No.</TableHead>
                            <TableHead className="h-auto py-2 align-top">
                                <SortHeader label="User" column="username" sort={sort} order={order} onSort={handleSort} />
                                <ColumnSearch
                                    value={userSearch}
                                    onChange={(v) => {
                                        setUserSearch(v);
                                        setPage(1);
                                    }}
                                />
                            </TableHead>
                            <TableHead className="h-auto py-2 align-top">
                                <SortHeader label="Service" column="service_name" sort={sort} order={order} onSort={handleSort} />
                                <ColumnSearch
                                    value={serviceSearch}
                                    onChange={(v) => {
                                        setServiceSearch(v);
                                        setPage(1);
                                    }}
                                />
                            </TableHead>
                            <TableHead className="h-auto py-2 align-top">
                                <SortHeader label="Date" column="booking_date" sort={sort} order={order} onSort={handleSort} />
                                {/* date filter, styled like ColumnSearch */}
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => {
                                        setDate(e.target.value);
                                        setPage(1);
                                    }}
                                    aria-label="Filter by date"
                                    className="mt-1 w-36 border-0 border-b bg-transparent py-1 text-xs font-normal outline-none focus:border-foreground"
                                />
                            </TableHead>
                            <TableHead className="py-2 align-top">
                                <div className="flex items-center gap-1">
                                    <SortHeader label="Status" column="status" sort={sort} order={order} onSort={handleSort} />
                                    <CheckboxFilter
                                        label="Filter status"
                                        options={STATUSES}
                                        selected={statuses}
                                        onChange={(value) => {
                                            setStatuses(value);
                                            setPage(1);
                                        }}
                                    />
                                </div>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRowsSkeleton columns={["", "", "", "", ""]} />
                        ) : bookings.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                    {isFiltering ? "No bookings match your filters." : "No bookings yet."}
                                </TableCell>
                            </TableRow>
                        ) : (
                            bookings.map((b, i) => (
                                <TableRow key={b.id}>
                                    <TableCell>{from + i}</TableCell>
                                    <TableCell className="font-medium">{b.username}</TableCell>
                                    <TableCell>
                                        {/* the service name opens the detail page (approve / reject) */}
                                        <Link href={"/admin/bookings/" + b.id} className="underline-offset-4 hover:underline">
                                            {b.service_name}
                                        </Link>
                                    </TableCell>
                                    <TableCell>{b.booking_date}</TableCell>
                                    <TableCell>
                                        <StatusBadge status={b.status} />
                                    </TableCell>
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