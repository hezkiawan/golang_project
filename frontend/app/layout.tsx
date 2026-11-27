import "./globals.css";
import StoreProvider from "./StoreProvider";
import { ThemeProvider } from "@/components/theme-provider";


export const metadata = {
  title: "HomeFix Booking",
};

// nge wrap tiap halaman.  navbar moved to (main)/layout.tsx
// 
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the theme script adds class="dark" and color-scheme to <html>
    <html lang="en" suppressHydrationWarning>
      {/* min-h-screen buat biar tall as the browser window, antialias buat better font rendering */}
      {/* also wrap children with the sore provider */}
      <body className="min-h-screen bg-background text-foreground antialiased">
        {/*before React hydrates. This tells React that the difference on <html> is expected. */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <StoreProvider>{children}</StoreProvider>
        </ThemeProvider>
      </body>
    </html >
  );
}