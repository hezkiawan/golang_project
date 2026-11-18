"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";


type SortHeaderProps = {
    label: string;               // what the header shows: "Username"
    column: string;              // what we send to Go: "username"
    sort: string;                // the currently sorted column ("" = none)
    order: "asc" | "desc";
    onSort: (column: string) => void;
};

// a clickable column title with a sort icon
export function SortHeader({ label, column, sort, order, onSort }: SortHeaderProps) {
    const active = sort === column;

    return (
        <button
            type="button"
            onClick={() => onSort(column)}
            className="group inline-flex items-center gap-1 hover:text-foreground"
        >
            {label}
            {active ? (
                order === "asc" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />
            ) : (
                // not sorted by this column: faint ⇅, full strength when hovering the header
                <ArrowUpDown className="size-4 opacity-30 group-hover:opacity-100" />
            )}
        </button>
    );
}