"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { RowsSkeleton } from "@/components/loading-skeletons";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setMe, clearMe } from "@/lib/features/auth/authSlice";

type Me = {
    user_id: number;
    username: string;
    role: string;
};

const links = [
    { href: "/admin/services", label: "Services" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/bookings", label: "Bookings" },
    { href: "/admin/notifications", label: "Notifications" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const me = useAppSelector((state) => state.auth.me); // read from the store
    const dispatch = useAppDispatch();                    // to send actions
    const [open, setOpen] = useState(false);

    useEffect(() => {
        fetch("/api/auth/me").then(async (res) => {
            if (!res.ok) {
                router.push("/login"); // not logged in
                return;
            }
            const data = await res.json();
            if (data.role !== "admin") {
                router.push("/"); // logged in, but not an admin
                return;
            }
            dispatch(setMe(data));
        });
    }, []);

    function linkClass(href: string) {
        return pathname === href ? "text-sm font-medium text-foreground" : "text-sm text-muted-foreground hover:text-foreground";
    }

    function drawerLinkClass(href: string) {
        return pathname === href
            ? "rounded-md bg-muted px-3 py-3 text-base font-medium text-foreground"
            : "rounded-md px-3 py-3 text-base text-muted-foreground hover:bg-muted hover:text-foreground";
    }

    async function handleLogout() {
        await fetch("/api/auth/logout", { method: "POST" });
        dispatch(clearMe()); // redux action dispatch to forget the user
        router.push("/login");
    }


    if (me === null) {
        return (
            <div>
                <header className="border-b bg-muted">
                    <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
                        <Skeleton className="h-6 w-24" />           {/* title sekeleton*/}
                        <Skeleton className="h-8 w-8 md:w-40" />    {/* navbar skeleton*/}
                    </div>
                </header>
                <main className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
                    <Skeleton className="h-8 w-48" />              {/* page title */}
                    <RowsSkeleton />                                {/* page content */}
                </main>
            </div>
        )
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