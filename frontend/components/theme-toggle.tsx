"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// the three choices in the popover, in display order
const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
];

export default function ThemeToggle() {
    const { theme, resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);

    // effects only run in the browser, after hydration
    useEffect(() => {
        setMounted(true);
    }, []);

    // the server doesn't know the theme, so render the same neutral button
    // on the server and on the first browser render
    if (!mounted) {
        return <Button variant="ghost" size="icon" disabled aria-label="Change theme" />;
    }

    // the icon shows what is on screen, so "system" displays Sun or Moon
    const TriggerIcon = resolvedTheme === "dark" ? Moon : Sun;

    function choose(value: string) {
        setTheme(value); // next-themes saves it, updates <html> and syncs other tabs
        setOpen(false);
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={<Button variant="ghost" size="icon" aria-label="Change theme" />}>
                <TriggerIcon />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-40 p-1">
                {options.map((option) => {
                    const Icon = option.icon;
                    const selected = theme === option.value;
                    return (
                        <Button
                            key={option.value}
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            aria-pressed={selected}
                            onClick={() => choose(option.value)}
                        >
                            <Icon />
                            {option.label}
                            {selected && <Check className="ml-auto" />}
                        </Button>
                    );
                })}
            </PopoverContent>
        </Popover>
    );
}