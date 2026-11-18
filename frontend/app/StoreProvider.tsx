"use client";

import { useState } from "react";
import { Provider } from "react-redux";
import { makeStore, type AppStore } from "@/lib/store";

export default function StoreProvider({ children }: { children: React.ReactNode }) {
    // the lazy initializer (makeStore) runs only on the first render → the store is created exactly once
    const [store] = useState<AppStore>(makeStore);

    return <Provider store={store}>{children}</Provider>;
}