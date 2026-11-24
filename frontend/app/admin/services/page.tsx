"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableRowsSkeleton } from "@/components/loading-skeletons";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { addService, deleteService, fetchServices, updateService, type Service } from "@/lib/features/services/serviceSlice";

export default function AdminServicesPage() {
    const dispatch = useAppDispatch();

    // GLOBAL - FROM REDUX STORE
    const services = useAppSelector((state) => state.services.items);
    const loadStatus = useAppSelector((state) => state.services.loadStatus);
    const addStatus = useAppSelector((state) => state.services.addStatus);

    // LOCAL - ONLY IN THIS COMPONENT
    const [name, setName] = useState("");
    const [message, setMessage] = useState("");
    const [isError, setIsError] = useState(false);

    // inline edit: which row is being edited, and the text in its input
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState("");
    // which row is waiting for the server (save or delete), so only that row's buttons are disabled
    const [busyId, setBusyId] = useState<number | null>(null);

    useEffect(() => {
        dispatch(fetchServices());
    }, [dispatch]); //dispatch normally doesnt change but because you are using dispatch inside the useEffect

    //services.length == 0 cause the store survives page changes, so it shows instantly
    const showSkeleton = (loadStatus === "idle" || loadStatus === "loading") && services.length === 0;

    function showResult(text: string, error: boolean) {
        setIsError(error);
        setMessage(text);
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        try {
            // unwrap(): the new service on success, the rejectWithValue text on failure
            const created = await dispatch(addService(name)).unwrap();
            showResult(`Service "${created.name}" added.`, false);
            setName("");
            await dispatch(fetchServices()).unwrap();
        } catch (err) {
            showResult(err as string, true); // error from go
        }
    }

    function startEdit(s: Service) {
        setEditingId(s.id);
        setEditName(s.name);
    }

    function cancelEdit() {
        setEditingId(null);
        setEditName("");
    }

    async function handleSave(id: number) {
        setBusyId(id);
        try {
            const updated = await dispatch(updateService({ id: id, name: editName })).unwrap();
            showResult(`Service renamed to "${updated.name}".`, false);
            cancelEdit();
            // refetch instead of patching the list: also picks up changes made by other admins
            await dispatch(fetchServices()).unwrap();
        } catch (err) {
            showResult(err as string, true);
        }
        setBusyId(null);
    }

    async function handleDelete(s: Service) {
        // a simple browser confirm is enough here: deleting is a soft delete
        if (!window.confirm(`Delete "${s.name}"? Users can no longer book it. Old bookings keep its name.`)) return;

        setBusyId(s.id);
        try {
            await dispatch(deleteService(s.id)).unwrap();
            showResult(`Service "${s.name}" deleted.`, false);
            await dispatch(fetchServices()).unwrap();
        } catch (err) {
            showResult(err as string, true);
        }
        setBusyId(null);
    }

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-semibold">Services</h1>
                <p className="text-sm text-muted-foreground">Add, rename or delete the services that users can book.</p>
            </div>

            {/* input to add service */}
            <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-2  sm:flex-row sm:items-end">
                <div className="w-full space-y-2 sm:w-auto">
                    <Label htmlFor="name">Service name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AC Repair" className="w-full sm:w-64" />
                </div>

                <Button type="submit" className="w-full sm:w-auto" disabled={addStatus === "loading" || name.trim() === ""}>
                    {addStatus === "loading" ? "Adding..." : "Add service"}
                </Button>

            </form>

            {message && (
                <p
                    className={
                        isError
                            ? "mb-6 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
                            : "mb-6 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800"
                    }
                >
                    {message}
                </p>
            )}

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="hidden sm:table-cell">#</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {showSkeleton ? (
                            // 1. loading: placeholder rows, same 3 columns, # hidden on phones like the real one
                            <TableRowsSkeleton columns={["hidden sm:table-cell", "", ""]} />
                        ) : services.length === 0 ? (
                            // 2. loaded but empty
                            <TableRow>
                                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                                    No services yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            // 3. loaded with data
                            services.map((s) => (
                                <TableRow key={s.id}>
                                    <TableCell className="hidden sm:table-cell">{s.id}</TableCell>

                                    {editingId === s.id ? (
                                        // this row is being edited: input + Save / Cancel
                                        <>
                                            <TableCell>
                                                <Input
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" && editName.trim() !== "") handleSave(s.id);
                                                        if (e.key === "Escape") cancelEdit();
                                                    }}
                                                    aria-label="New service name"
                                                    className="h-8 w-full sm:w-64"
                                                    autoFocus
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex justify-end gap-2">
                                                    <Button size="sm" disabled={busyId === s.id || editName.trim() === ""} onClick={() => handleSave(s.id)}>
                                                        {busyId === s.id ? "Saving..." : "Save"}
                                                    </Button>
                                                    <Button size="sm" variant="outline" disabled={busyId === s.id} onClick={cancelEdit}>
                                                        Cancel
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </>
                                    ) : (
                                        // normal row: name + Edit / Delete
                                        <>
                                            <TableCell className="font-medium">{s.name}</TableCell>
                                            <TableCell>
                                                <div className="flex justify-end gap-2">
                                                    <Button size="sm" variant="outline" disabled={busyId === s.id} onClick={() => startEdit(s)}>
                                                        Edit
                                                    </Button>
                                                    <Button size="sm" variant="destructive" disabled={busyId === s.id} onClick={() => handleDelete(s)}>
                                                        {busyId === s.id ? "Deleting..." : "Delete"}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </>
                                    )}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

        </div>
    );
}
