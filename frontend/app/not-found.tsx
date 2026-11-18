import { NotFoundActions } from "@/components/not-found-actions";

export const metadata = {
    title: "Page not found · HomeFix",
};

export default function NotFound() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
            <p className="text-2xl font-medium text-muted-foreground">404</p>
            <h1 className="text-3xl font-semibold">Page not found</h1>
            <p className="max-w-sm text-sm text-muted-foreground">
                The page you&apos;re looking for doesn&apos;t exist.
            </p>
            <NotFoundActions />
        </main>
    );
}