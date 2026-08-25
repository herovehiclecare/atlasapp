import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Supabase picks a storage backend once, at client creation — but "remember me"
// needs that choice to change per sign-in. This adapter indirects through a
// swappable backend so setAuthPersistence() can flip it before each sign-in:
// localStorage survives browser restarts, sessionStorage clears when the tab closes.
//
// The choice itself has to be remembered too: a page reload re-runs this
// module from scratch, so without persisting the flag somewhere durable,
// activeStorage would always reset to its localStorage default — even for a
// "don't remember me" session whose token actually lives in sessionStorage —
// making the user look logged out on a simple refresh, not just tab close.
const REMEMBER_KEY = "atlas-remember-me";

function resolveInitialStorage() {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "false" ? sessionStorage : localStorage;
  } catch {
    return localStorage;
  }
}

let activeStorage = resolveInitialStorage();

export function setAuthPersistence(remember) {
  activeStorage = remember ? localStorage : sessionStorage;
  try { localStorage.setItem(REMEMBER_KEY, String(remember)); } catch {}
}

const storage = {
  getItem: (key) => activeStorage.getItem(key),
  setItem: (key, value) => activeStorage.setItem(key, value),
  removeItem: (key) => activeStorage.removeItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { storage },
});
