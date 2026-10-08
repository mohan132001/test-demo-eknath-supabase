import { createClient } from "@supabase/supabase-js";

// Baked in at BUILD time (Openship env vars or .env)
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
