"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes keeps the theme in React context, so it must run as a client component.
// In `npm run dev` the console shows "Encountered a script tag while rendering React component".
// It's a development-only React warning and the theme still works:
// https://github.com/pacocoursey/next-themes/issues/385
export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
    return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}