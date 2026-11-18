import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./features/auth/authSlice";
import servicesReducer from "./features/services/serviceSlice";
import bookingsReducer from "./features/bookings/bookingSlice"

// function that creates a store (one per request in Next.js), not a global store
export const makeStore = () => {
    return configureStore({
        reducer: {
            auth: authReducer, // state.auth is managed by the auth slice
            services: servicesReducer, // state.services is managed by the services slice
            bookings: bookingsReducer
        },
    });
};

// the store with actuall data will look like
// {
//   "auth": {
//     "me": null
//   },
//   "services": {
//     "items": [],
//     "loadStatus": "idle",
//     "addStatus": "idle",
//     "error": null
//   }
// }

// types derived from the store, so TypeScript knows the exact shape of the state
export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];