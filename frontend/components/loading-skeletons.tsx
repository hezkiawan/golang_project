import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";


// placeholder cards, same grid as the real services grid
export function CardGridSkeleton({ cards = 3 }: { cards?: number }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: cards }).map((_, i) => (
                <div key={i} className="space-y-3 rounded-xl border p-6">
                    <Skeleton className="h-5 w-2/3" /> {/* title */}
                    <Skeleton className="h-4 w-1/3" /> {/* description */}
                    <Skeleton className="h-9 w-full" /> {/* button */}
                </div>
            ))}
        </div>
    );
}

// placeholder rows for tables and lists
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
    return (
        <div className="space-y-2 rounded-md border p-4">
            {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
            ))}
        </div>
    );
}


// skeleton ROWS for table only
// columns = one entry per column: the className that column's cells use ("" if none)
export function TableRowsSkeleton({ columns, rows = 5 }: { columns: string[]; rows?: number }) {
    return (
        <>
            {Array.from({ length: rows }).map((_, r) => (
                <TableRow key={r}>
                    {columns.map((className, c) => (
                        <TableCell key={c} className={className}>
                            <Skeleton className="h-4 w-full max-w-24" />
                        </TableCell>
                    ))}
                </TableRow>
            ))}
        </>
    );
}