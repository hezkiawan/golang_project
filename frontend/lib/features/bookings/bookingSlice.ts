import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

export type Booking = {
    id: number;
    service_id: number;
    user_id: number;
    booking_date: string;
    status: string;
    created_at: string;
    service_name?: string; // only sent by GET /bookings/me (JOIN), so deleted services keep their name
};

type BookingsState = {
    creatingServiceId: number | null; // which service is being booked right now (null = none)
    items: Booking[];             // my bookings
    loadStatus: "idle" | "loading" | "succeeded" | "failed";
    updatingId: number | null;    // which booking is being confirmed/cancelled right now
};

const initialState: BookingsState = {
    creatingServiceId: null,
    items: [],
    loadStatus: "idle",
    updatingId: null,

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

export const fetchMyBookings = createAsyncThunk<Booking[], void, { rejectValue: string }>(
    "bookings/fetchMine",
    async (_, { rejectWithValue }) => {
        const res = await fetch("/api/bookings/me");
        if (!res.ok) return rejectWithValue("Could not load bookings");
        return (await res.json()) as Booking[];
    },
);

// one thunk for both actions: action is "confirm" or "cancel"
export const changeBookingStatus = createAsyncThunk<Booking, { id: number; action: "confirm" | "cancel" }, { rejectValue: string }>(
    "bookings/changeStatus",
    async ({ id, action }, { rejectWithValue }) => {
        const res = await fetch("/api/bookings/" + id + "/" + action, { method: "POST" });
        const data = await res.json();
        if (!res.ok) return rejectWithValue(data.error || data.message);
        return data as Booking; // Go returns the updated booking (RETURNING ...)
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
            })
            .addCase(changeBookingStatus.pending, (state, action) => {
                state.updatingId = action.meta.arg.id; // this row is busy
            })
            .addCase(changeBookingStatus.fulfilled, (state, action) => {
                state.updatingId = null;
                // swap the old booking for the updated one: no need to reload the whole list
                const i = state.items.findIndex((b) => b.id === action.payload.id);
                // merge, don't replace: the confirm/cancel answer has no service_name, so keep the old one
                if (i !== -1) state.items[i] = { ...state.items[i], ...action.payload };
            })
            .addCase(changeBookingStatus.rejected, (state) => {
                state.updatingId = null;
            })
            .addCase(fetchMyBookings.pending, (state) => {
                state.loadStatus = "loading";
            })
            .addCase(fetchMyBookings.fulfilled, (state, action) => {
                state.loadStatus = "succeeded";
                state.items = action.payload;
            })
            .addCase(fetchMyBookings.rejected, (state) => {
                state.loadStatus = "failed";
            })
    },
});

export default bookingsSlice.reducer;