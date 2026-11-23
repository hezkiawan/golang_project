import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

export type Service = {
    id: number;
    name: string;
};

type ServicesState = {
    items: Service[];
    loadStatus: "idle" | "loading" | "succeeded" | "failed";
    addStatus: "idle" | "loading" | "failed";
    error: string | null;
};

const initialState: ServicesState = {
    items: [],
    loadStatus: "idle",
    addStatus: "idle",
    error: null,
};

// THUNK -> adalah yang actually request to the API
// so we are moving the api request from the components to the redux layer using THUNK
// createAsyncThunk: A Redux Toolkit function that handles asynchronous operations (like API calls) and automatically generates three lifecycle actions: pending, fulfilled, and rejected.

// <what it returns on success, what you pass in, the type of the error value>
export const fetchServices = createAsyncThunk<Service[], void, { rejectValue: string }>(
    // action type prefix, for createAsyncThunk redux automatically generate the three actions
    "services/fetchAll",

    //_ = the argument passed, { rejectWithValue } = custom error payload
    async (_, { rejectWithValue }) => {
        const res = await fetch("/api/services");
        // this becomes rejected 
        if (!res.ok) return rejectWithValue("Could not load services");

        // this becomes the fulfilled
        return (await res.json()) as Service[]; // becomes action.payload of "fulfilled"
    },
);

export const addService = createAsyncThunk<Service, string, { rejectValue: string }>(
    "services/add",
    async (name, { rejectWithValue }) => {
        const res = await fetch("/api/services", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name }),
        });
        const data = await res.json();
        if (!res.ok) return rejectWithValue(data.error || data.message); // Go's error text returned
        return data as Service; // Go returns the created service {id, name}
    },
);

// rename a service. The page refetches the list afterwards (so changes by other admins show up too)
export const updateService = createAsyncThunk<Service, { id: number; name: string }, { rejectValue: string }>(
    "services/update",
    async ({ id, name }, { rejectWithValue }) => {
        const res = await fetch("/api/services/" + id, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name }),
        });
        if (!res.ok) {
            // 400 empty name, 403 not admin, 404 missing: Go sends {"error": "..."}
            const data = await res.json().catch(() => ({}));
            return rejectWithValue(data.error || "Could not update the service");
        }
        return (await res.json()) as Service;
    },
);

// soft-delete a service. Go answers 204 (no body), so we only return the id
export const deleteService = createAsyncThunk<number, number, { rejectValue: string }>(
    "services/delete",
    async (id, { rejectWithValue }) => {
        const res = await fetch("/api/services/" + id, { method: "DELETE" });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return rejectWithValue(data.error || "Could not delete the service");
        }
        return id;
    },
);

// ---- slice: how the state changes at each moment ----
// extraReducers is a function that Redux Toolkit calls for you.
// Redux Toolkit passes an object called builder into that function.
// reducers: Handle actions you define yourself inside createSlice.
// extraReducers: Handle actions defined outside the slice, commonly async actions created with createAsyncThunk.
const servicesSlice = createSlice({
    name: "services",
    initialState,
    reducers: {}, // no plain actions needed here
    extraReducers: (builder) => {
        builder
            // loading the list
            .addCase(fetchServices.pending, (state) => {
                state.loadStatus = "loading";
            })
            .addCase(fetchServices.fulfilled, (state, action) => {
                state.loadStatus = "succeeded";
                state.items = action.payload;
            })
            .addCase(fetchServices.rejected, (state, action) => {
                state.loadStatus = "failed";
                state.error = action.payload ?? "error";
            })
            // adding one
            .addCase(addService.pending, (state) => {
                state.addStatus = "loading"; // ← the button reads this and disables itself
                state.error = null;
            })
            .addCase(addService.fulfilled, (state, action) => {
                state.addStatus = "idle";
                state.items.push(action.payload); // add the new service to the list: no reload needed
            })
            .addCase(addService.rejected, (state, action) => {
                state.addStatus = "failed";
                state.error = action.payload ?? "Something went wrong";
            });
    },
});

export default servicesSlice.reducer;