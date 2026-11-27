import ThemeToggle from "@/components/theme-toggle";

// untuk login dan register menghilangkan navbarr,  center whatever page is inside
export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return <main className="flex min-h-screen items-center justify-center bg-muted p-4">
        {/* theme togge on the top right */}
        <div className="absolute right-4 top-4">
            <ThemeToggle />
        </div>
        {children}
    </main>;
}