import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// same shape as GET /auth/me
export type Me = {
    user_id: number;
    username: string;
    email: string;
    role: string;
};

type AuthState = {
    me: Me | null; // null = not known misalnya ketika user logged out biar ga error
};

const initialState: AuthState = {
    me: null,
};

const authSlice = createSlice({
    name: "auth", // action types become "auth/setMe", "auth/clearMe"
    initialState,
    reducers: {
        // the rulebook, how each action changes the state
        setMe(state, action: PayloadAction<Me>) {
            state.me = action.payload;
        },
        clearMe(state) {
            state.me = null;
        },
    },
});

// createSlice generated these for us
export const { setMe, clearMe } = authSlice.actions; // action creators: setMe(user) → { type: "auth/setMe", payload: user }
export default authSlice.reducer;                     // the reducer, for the store