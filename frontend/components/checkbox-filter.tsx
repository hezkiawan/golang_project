"use client";

import { ListFilter } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type CheckboxFilterProps = {
    label: string;              // for screen readers: "Filter role"
    options: string[];          // every possible value: ["admin", "user"]
    selected: string[];         // the ticked ones
    onChange: (selected: string[]) => void;
};

// a filter icon that opens a small panel of checkboxes, like Kouventa's status filter
export function CheckboxFilter({ label, options, selected, onChange }: CheckboxFilterProps) {
    // tick → add to the list, untick → remove from the list
    function toggle(option: string, checked: boolean) {
        if (checked) {
            onChange([...selected, option]);
        } else {
            onChange(selected.filter((s) => s !== option));
        }
    }

    const isFiltering = selected.length < options.length; // something is unticked

    return (
        <Popover>
            {/* the icon is darker while a filter is active, so you can see it at a glance */}
            <PopoverTrigger
                aria-label={label}
                className={cn("rounded-sm p-1 hover:bg-muted", isFiltering ? "text-foreground" : "text-muted-foreground")}
            >
                <ListFilter className="size-4" />
            </PopoverTrigger>

            <PopoverContent className="w-44 space-y-2 p-3">
                {options.map((option) => {
                    const checked = selected.includes(option);
                    const isLastOne = checked && selected.length === 1; // can't untick the last one

                    return (
                        <label key={option} className="flex items-center gap-2 text-sm capitalize">
                            <Checkbox checked={checked} disabled={isLastOne} className={isLastOne ? "opacity-50" : ""} onCheckedChange={(value) => toggle(option, value === true)} />
                            {option}
                        </label>
                    );
                })}
            </PopoverContent>
        </Popover>
    );
}