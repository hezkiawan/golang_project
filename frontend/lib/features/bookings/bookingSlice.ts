import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

// what POST /bookings returns (Booking in internal/booking/model.go)
export type Booking = {
    id: number;
    service_id: number;
    user_id: number;
    booking_date: string;
    status: string;
    created_at: string;
};

// only the "book a service" flow lives here now.
// The My Bookings table keeps its page of data in local state (like the admin tables),
// and cancel/approve/reject happen on the booking detail page.
type BookingsState = {
    creatingServiceId: number | null; // which service is being booked right now (null = none)
};

const initialState: BookingsState = {
    creatingServiceId: null,
};

export const createBooking = createAsyncThunk<Booking, { serviceId: number; date: string }, { rejectValue: string }>(
    "bookings/create",
    async ({ serviceId, date }, { rejectWithValue }) => {
        const res = await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ service_id: serviceId, booking_date: date }),
        });
        const data = await res.json();
        if (!res.ok) return rejectWithValue(data.error || data.message); // includes the 409
        return data as Booking;
    },
);

const bookingsSlice = createSlice({
    name: "bookings",
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(createBooking.pending, (state, action) => {
                // action.meta.arg = what we passed to createBooking(...)
                state.creatingServiceId = action.meta.arg.serviceId;
            })
            .addCase(createBooking.fulfilled, (state) => {
                state.creatingServiceId = null;
            })
            .addCase(createBooking.rejected, (state) => {
                state.creatingServiceId = null;
            });
    },
});

export default bookingsSlice.reducer;
