import { useEffect, useState } from "react";

// returns `value`, but only after it has stopped changing for `delay` ms
export function useDebounce<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        // wait `delay` ms, then accept the value
        const timer = setTimeout(() => setDebounced(value), delay);
        // the value changed again before the time was up → cancel the old timer
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
}