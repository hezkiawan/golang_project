"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type TablePaginationProps = {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
    onLimitChange: (limit: number) => void;
};

// Kouventa-style footer: data per page · showing X to Y of Z · « ‹ 1 2 3 › »
export function TablePagination({ page, limit, total, onPageChange, onLimitChange }: TablePaginationProps) {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    // up to 3 page buttons around the current page
    let start = Math.max(1, page - 1);
    const end = Math.min(totalPages, start + 2);
    start = Math.max(1, end - 2);
    const pageNumbers: number[] = [];
    for (let p = start; p <= end; p++) {
        pageNumbers.push(p);
    }

    return (
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm">
                <label htmlFor="limit">Data per page:</label>
                <select
                    id="limit"
                    value={limit}
                    onChange={(e) => onLimitChange(Number(e.target.value))}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                </select>
            </div>

            <p className="text-sm text-muted-foreground">
                Showing {from} to {to} of {total} entries
            </p>

            <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" disabled={page === 1} onClick={() => onPageChange(1)} aria-label="First page">
                    <ChevronsLeft />
                </Button>
                <Button variant="outline" size="icon" disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
                    <ChevronLeft />
                </Button>
                {pageNumbers.map((p) => (
                    <Button key={p} variant={p === page ? "default" : "outline"} size="icon" onClick={() => onPageChange(p)}>
                        {p}
                    </Button>
                ))}
                <Button variant="outline" size="icon" disabled={page === totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
                    <ChevronRight />
                </Button>
                <Button variant="outline" size="icon" disabled={page === totalPages} onClick={() => onPageChange(totalPages)} aria-label="Last page">
                    <ChevronsRight />
                </Button>
            </div>
        </div>
    );
}