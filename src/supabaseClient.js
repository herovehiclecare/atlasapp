import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Supabase picks a storage backend once, at client creation — but "remember me"
// needs that choice to change per sign-in. This adapter indirects through a
// swappable backend so setAuthPersistence() can flip it before each sign-in:
// localStorage survives browser restarts, sessionStorage clears when the tab closes.
let activeStorage = localStorage;

export function setAuthPersistence(remember) {
  activeStorage = remember ? localStorage : sessionStorage;
}

const storage = {
  getItem: (key) => activeStorage.getItem(key),
  setItem: (key, value) => activeStorage.setItem(key, value),
  removeItem: (key) => activeStorage.removeItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { storage },
});
