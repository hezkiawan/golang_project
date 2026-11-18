"use client";

import { Search } from "lucide-react";

// small search box component under a column title
export function ColumnSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return (
        <div className="relative mt-1">
            <Search className="pointer-events-none absolute top-1/2 left-0 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Search..."
                className="w-full border-0 border-b bg-transparent py-1 pl-5 text-xs font-normal outline-none placeholder:text-muted-foreground focus:border-foreground"
            />
        </div>
    );
}