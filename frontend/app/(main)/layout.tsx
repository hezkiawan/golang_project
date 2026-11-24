"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { RowsSkeleton } from "@/components/loading-skeletons";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setMe, clearMe } from "@/lib/features/auth/authSlice";
import { signInToFirebase, signOutOfFirebase } from "@/lib/firebase";
import NotificationBell from "@/components/notification-bell";

// User struct
type Me = {
  user_id: number;
  username: string;
  email: string;
  role: string;
};

const links = [
  { href: "/", label: "Services" },
  { href: "/bookings", label: "Bookings" },
];

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // const [me, setMe] = useState<Me | null>(null); -> no longer uses useState
  const me = useAppSelector((state) => state.auth.me); // read from the store
  const dispatch = useAppDispatch();                    // to send actions

  const [open, setOpen] = useState(false);

  // ketika page di main dibuka tanya backend siapa yang log in
  useEffect(() => {
    fetch("/api/auth/me").then(async (res) => {
      if (!res.ok) {
        // if not logged it -> route to /login page 
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (data.role === "admin") {
        router.push("/admin/services");
        return;
      }
      dispatch(setMe(data)); // uses redux
      // also sign in to Firebase (for the live notification bell). If it fails,
      // the rest of the app still works, so we only log the error.
      signInToFirebase().catch((err) => console.error("firebase sign-in failed:", err));
    });
  }, []);

  async function handleLogout() {
    setOpen(false);
    // sign out of Firebase first, so the bell's listeners stop right away
    try {
      await signOutOfFirebase();
    } catch (err) {
      console.error("firebase sign-out failed:", err);
    }
    await fetch("/api/auth/logout", { method: "POST" });
    dispatch(clearMe()); // redux action dispatch to forget the user
    router.push("/login");
  }

  // link berubah jadi medium font
  function linkClass(href: string) {
    return pathname === href ? "text-sm font-medium text-foreground" : "text-sm text-muted-foreground hover:text-foreground";
  }

  // drawer links: bigger text + padding so the whole row is easy to tap
  function drawerLinkClass(href: string) {
    return pathname === href
      ? "rounded-md bg-muted px-3 py-3 text-base font-medium text-foreground"
      : "rounded-md px-3 py-3 text-base text-muted-foreground hover:bg-muted hover:text-foreground";
  }

  // ga kasih liat page sampe log in
  if (me === null) {
    return (
      <div>
        <header className="border-b">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
            <Skeleton className="h-6 w-24" />           {/* title skeleton*/}
            <Skeleton className="h-8 w-8 md:w-40" />    {/* navbar skeleton */}
          </div>
        </header>
        <main className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
          <Skeleton className="h-8 w-48" />              {/* page title */}
          <RowsSkeleton />                                {/* page content */}
        </main>
      </div>
    );
  }

  return (
    <div>
      <header className="border-b">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          {/* left side*/}
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-semibold">
              HomeFix
            </Link>

            {/* medium size links */}
            <div className="hidden items-center gap-6 md:flex">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className={linkClass(l.href)}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>

          {/* right side: the bell is visible at every width */}
          <div className="flex items-center gap-2 md:gap-4">
            <NotificationBell />
            {/* medium size right size right side */}
            <div className="hidden items-center gap-4 md:flex">
              <span className="text-sm text-muted-foreground">Hi, {me.username}</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
            {/* phone size hamburger button */}
            <Button variant="ghost" size="icon" className="md:hidden" onClick={(e) => setOpen(true)}>
              <Menu />
            </Button>
          </div>
        </nav>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right">
          {/* Header */}
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>

          {/* links at the top, as full-width rows */}
          <div className="flex flex-1 flex-col justify-center gap-1 px-2">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={drawerLinkClass(l.href)} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
          </div>

          {/* footer */}
          <SheetFooter className="border-t">
            <p className="text-sm text-muted-foreground">Signed in as {me.username}</p>
            <Button variant="outline" className="w-full" onClick={handleLogout}>
              Logout
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div >
  );
}