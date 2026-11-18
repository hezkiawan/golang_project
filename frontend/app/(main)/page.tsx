"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardGridSkeleton } from "@/components/loading-skeletons";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchServices } from "@/lib/features/services/serviceSlice";
import { createBooking } from "@/lib/features/bookings/bookingSlice";

export default function HomePage() {
  // GLOBAL STATE
  const dispatch = useAppDispatch();
  const services = useAppSelector((state) => state.services.items);
  const loadStatus = useAppSelector((state) => state.services.loadStatus);
  const creatingServiceId = useAppSelector((state) => state.bookings.creatingServiceId);

  // LOCAL STATE
  const [date, setDate] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [bookedIds, setBookedIds] = useState<number[]>([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);




  // tanggal in YYYY-MM-DD
  const today = new Date().toLocaleDateString("en-CA");

  useEffect(() => {
    dispatch(fetchServices())
  }, [dispatch]);

  // runs again every time the user picks a different date
  useEffect(() => {
    if (date === "") {
      setBookedIds([]); // no date yet -> nothing is booked
      return;
    }

    let ignore = false
    setCheckingAvailability(true)

    fetch("/api/bookings/availability?date=" + date).then(async (res) => {
      if (ignore) return; // an answer for an old date: throw it away
      if (!res.ok) return;
      const data = await res.json();
      setBookedIds(data.booked_service_ids);
      setCheckingAvailability(false)
    });

    // cleanup: React runs this when date changes again (or the page closes)
    return () => {
      ignore = true;
    };
  }, [date]);


  async function handleBook(serviceId: number) {
    try {
      const created = await dispatch(createBooking({ serviceId: serviceId, date: date })).unwrap();
      setIsError(false);
      setMessage("Booking #" + created.id + " created (pending). Go to My Bookings to confirm it.");
      setBookedIds([...bookedIds, serviceId]);
      
    } catch (err) {
      setIsError(true);
      setMessage(err as string);
    }
  }

  const showSkeleton = (loadStatus === "idle" || loadStatus === "loading") && services.length === 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Book a service</h1>
        <p className="text-sm text-muted-foreground">Pick a date, then choose a service.</p>
      </div>

      {/* date picker */}
      <div className="mb-6 space-y-2">
        <Label htmlFor="date">Date</Label>
        <Input id="date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
      </div>

      {/* green box for success, red box for errors */}
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

      {showSkeleton ? (
        <CardGridSkeleton />
      ) : (

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const isBooked = bookedIds.includes(s.id); // is this service taken on the picked date?

            return (
              <Card key={s.id} className={isBooked ? "opacity-60" : ""}>
                <CardHeader>
                  <CardTitle>{s.name}</CardTitle>
                  <CardDescription>{isBooked ? "Unavailable on this date" : "Service #" + s.id}</CardDescription>
                </CardHeader>
                <CardFooter>
                  <Button className="w-full" disabled={date === "" || checkingAvailability || isBooked || creatingServiceId !== null} onClick={() => handleBook(s.id)}>
                    {date === ""
                      ? "Please choose a date"
                      : checkingAvailability
                        ? "Checking..."
                        : creatingServiceId === s.id
                          ? "Booking..."
                          : isBooked
                            ? "Booked"
                            : "Book"}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}