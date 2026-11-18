import "./globals.css";
import StoreProvider from "./StoreProvider";

export const metadata = {
  title: "HomeFix Booking",
};

// nge wrap tiap halaman.  navbar moved to (main)/layout.tsx
// 
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* min-h-screen buat biar tall as the browser window, antialias buat better font rendering */}
      {/* also wrap children with the sore provider */}
      <body className="min-h-screen bg-background text-foreground antialiased"><StoreProvider>{children}</StoreProvider></body>
    </html>
  );
}