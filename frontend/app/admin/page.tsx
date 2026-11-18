import { redirect } from "next/navigation";

// /admin has no content of its own, so send admins to the first admin page
export default function AdminPage() {
    redirect("/admin/services");
}