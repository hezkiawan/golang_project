"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableRowsSkeleton } from "@/components/loading-skeletons";
import { useDebounce } from "@/lib/use-debounce";
import { CheckboxFilter } from "@/components/checkbox-filter";
import { SortHeader } from "@/components/data-table/sort-header";
import { ColumnSearch } from "@/components/data-table/column-search";
import { TablePagination } from "@/components/data-table/table-pagination";

// same shape as bodyResponse in GetAllUsername
type User = {
    user_id: number;
    username: string;
    email: string;
    role: string;
};







export default function AdminUsersPage() {
    // from the server
    const [users, setUsers] = useState<User[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    // from the client
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sort, setSort] = useState("");                     // "" = no column sorting
    const [order, setOrder] = useState<"asc" | "desc">("asc");

    // FOR SEARCH
    // what the user is typing (updates on every keystroke)
    const [globalSearch, setGlobalSearch] = useState("");
    const [usernameSearch, setUsernameSearch] = useState("");
    const [emailSearch, setEmailSearch] = useState("");

    // the same values, but only after a 400ms pause → these drive the request
    const debouncedGlobal = useDebounce(globalSearch, 400);
    const debouncedUsername = useDebounce(usernameSearch, 400);
    const debouncedEmail = useDebounce(emailSearch, 400);

    // FOR FILTERING ROLES
    const [roles, setRoles] = useState<string[]>(["admin", "user"]); // all ticked = no filter

    // click cycle on one column: off → asc → desc → off
    function handleSort(column: string) {
        if (sort !== column) {
            setSort(column);   // a new column: start ascending
            setOrder("asc");
        } else if (order === "asc") {
            setOrder("desc");  // same column again: flip to descending
        } else {
            setSort("");       // third click: back to the default order
            setOrder("asc");
        }
        setPage(1);          // a new order → start from page 1
    }

    useEffect(() => {
        // lets the cleanup cancel this request if the filters change before it finishes
        const controller = new AbortController();
        setLoading(true);

        const params = new URLSearchParams({
            page: String(page),
            limit: String(limit),
        });
        if (sort !== "") {
            params.set("sort", sort);
            params.set("order", order);
        }
        if (debouncedGlobal.trim() !== "") params.set("q", debouncedGlobal.trim());
        if (debouncedUsername.trim() !== "") params.set("username", debouncedUsername.trim());
        if (debouncedEmail.trim() !== "") params.set("email", debouncedEmail.trim());

        if (roles.length < 2) params.set("role", roles.join(",")); // only send it when something is unticked

        async function loadUsers() {
            try {
                const res = await fetch("/api/users?" + params.toString(), { signal: controller.signal });
                if (res.ok) {
                    const data = await res.json(); // also cancelled by the signal
                    setUsers(data.data ?? []);
                    setTotal(data.total ?? 0);
                }
                setLoading(false);
            } catch (err) {
                // we cancelled this request ourselves: a newer one is already running
                if (err instanceof Error && err.name === "AbortError") return;
                setLoading(false); // a real network error: don't leave the skeleton forever
            }
        }
        loadUsers();

        // cleanup: React runs this when a filter changes (or the page closes)
        return () => {
            controller.abort();
        };
    }, [page, limit, sort, order, debouncedGlobal, debouncedUsername, debouncedEmail, roles]);

    // numbers for the footer, calculated from state
    const from = total === 0 ? 0 : (page - 1) * limit + 1;


    return (
        <div>
            {/* HEADER & GLOBAL SEARCH */}
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">Users</h1>
                    <p className="text-sm text-muted-foreground">All registered users.</p>
                </div>
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={globalSearch}
                        onChange={(e) => {
                            setGlobalSearch(e.target.value);
                            setPage(1); // a new search → start from page 1
                        }}
                        placeholder="Search users..."
                        className="pl-8"
                    />
                </div>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-16 align-top py-2">No.</TableHead>
                            <TableHead className="h-auto py-2 align-top">
                                <SortHeader label="Username" column="username" sort={sort} order={order} onSort={handleSort} />
                                <ColumnSearch
                                    value={usernameSearch}
                                    onChange={(v) => {
                                        setUsernameSearch(v);
                                        setPage(1);
                                    }}
                                />
                            </TableHead>
                            <TableHead className="h-auto py-2 align-top">
                                <SortHeader label="Email" column="email" sort={sort} order={order} onSort={handleSort} />
                                <ColumnSearch
                                    value={emailSearch}
                                    onChange={(v) => {
                                        setEmailSearch(v);
                                        setPage(1);
                                    }}
                                />
                            </TableHead>
                            <TableHead className="align-top py-2">
                                <div className="flex items-center gap-1">
                                    <SortHeader label="Role" column="role" sort={sort} order={order} onSort={handleSort} />
                                    <CheckboxFilter
                                        label="Filter role"
                                        options={["admin", "user"]}
                                        selected={roles}
                                        onChange={(value) => {
                                            setRoles(value);
                                            setPage(1); // a new filter → start from page 1
                                        }}
                                    />
                                </div>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRowsSkeleton columns={["", "", "", ""]} />
                            // EMPTY MESSAGE
                        ) : users.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                                    {globalSearch || usernameSearch || emailSearch || roles.length < 2 ? "No users match your search." : "No users found."}                                </TableCell>
                            </TableRow>
                        ) : (
                            users.map((u, i) => (
                                <TableRow key={u.user_id}>
                                    {/* row number across pages: page 2 starts at 11, not 1 */}
                                    <TableCell>{from + i}</TableCell>
                                    <TableCell className="font-medium">{u.username}</TableCell>
                                    <TableCell>{u.email}</TableCell>
                                    <TableCell>
                                        <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
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