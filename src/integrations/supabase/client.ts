import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { readFrontendConfig } from './frontendConfig';

const { url, publishableKey } = readFrontendConfig(import.meta.env);

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    // The SDK uses browser localStorage, with an in-memory fallback if unavailable.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});
