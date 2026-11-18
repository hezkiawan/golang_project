"use client"; // "Go back" needs onClick, so this part runs in the browser

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";

export function NotFoundActions() {
    const router = useRouter();

    return (
        <div className="flex w-full max-w-xs flex-col gap-2 sm:w-auto sm:max-w-none sm:flex-row">
            <Link href="/" className={buttonVariants()}>
                Go to HomeFix
            </Link>
            <Button variant="outline" onClick={() => router.back()}>
                Go back
            </Button>
        </div>
    );
}