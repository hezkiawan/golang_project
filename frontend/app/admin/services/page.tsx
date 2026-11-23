"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RowsSkeleton, TableRowsSkeleton } from "@/components/loading-skeletons";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { addService, fetchServices } from "@/lib/features/services/serviceSlice";

// same shape as the Service struct in internal/catalog/model.go
type Service = {
    id: number;
    name: string;
};

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
    // const [services, setServices] = useState<Service[]>([]); --> NO LONGER USED
    // const [loading, setLoading] = useState(true); --> NO LONGER USED

    // async function loadServices() {
    //     const res = await fetch("/api/services");
    //     if (res.ok) setServices(await res.json());
    //     setLoading(false);
    // } -- > MOVED TO REDUX

    useEffect(() => {
        // loadServices(); --> CHANGED TO USING REDUX
        dispatch(fetchServices());
    }, [dispatch]); //dispatch normally doesnt change but because you are using dispatch inside the useEffect

    //services.length == 0 cause the store survives page changes, so it shows instantly
    const showSkeleton = (loadStatus === "idle" || loadStatus === "loading") && services.length === 0;

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        // const res = await fetch("/api/services", {
        //     method: "POST",
        //     headers: { "Content-Type": "application/json" },
        //     body: JSON.stringify({ name: name }),
        // });
        // const data = await res.json();

        // if (res.ok) {
        //     setIsError(false);
        //     setMessage('Service "' + data.name + '" added.');
        //     setName(""); // clear the input for the next one
        //     loadServices(); // refresh the table
        // } else {
        //     // 400 = empty name, 403 = not admin
        //     setIsError(true);
        //     setMessage(data.error || data.message);
        // } --> MOVED TO REDUX

        try {
            // unwrap(): the new service on success, the rejectWithValue text on failure
            // reducer di redux akan secara langsung add ke services sehinnga akan rerender after addding
            const created = await dispatch(addService(name)).unwrap();
            setIsError(false);
            setMessage(`Service "${created.name}" added.`)
            setName("")
            await dispatch(fetchServices()).unwrap()
        } catch (err) {
            setIsError(true);
            setMessage(err as string) // error from go 
        }
    }

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-semibold">Services</h1>
                <p className="text-sm text-muted-foreground">Add a new service that users can book.</p>
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
                            <TableHead>#</TableHead>
                            <TableHead>Name</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {showSkeleton ? (
                            // 1. loading: placeholder rows, same 5 columns, # hidden on phones like the real one
                            <TableRowsSkeleton columns={["hidden sm:table-cell", "", "", "", ""]} />
                        ) : services.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                    No bookings yet.
                                </TableCell>
                            </TableRow>
                        ) :
                            (
                                services.map((s) => (
                                    <TableRow key={s.id}>
                                        <TableCell>{s.id}</TableCell>
                                        <TableCell className="font-medium">{s.name}</TableCell>
                                    </TableRow>
                                ))
                            )
                        }
                    </TableBody>
                </Table>
            </div>

        </div>
    );

    
}