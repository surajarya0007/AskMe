import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let currentUrl = '';
let currentKey = '';

/**
 * Returns a cached Supabase client or instantiates a new one if credentials change.
 */
export const getSupabase = (url?: string, anonKey?: string): SupabaseClient | null => {
  if (!url || !anonKey) {
    return supabaseInstance;
  }
  
  if (url !== currentUrl || anonKey !== currentKey) {
    currentUrl = url;
    currentKey = anonKey;
    try {
      // Create a new client instance
      supabaseInstance = createClient(url, anonKey, {
        auth: {
          persistSession: false // We only use database features, no auth flows
        }
      });
    } catch (e) {
      console.error('Failed to create Supabase client:', e);
      supabaseInstance = null;
      currentUrl = '';
      currentKey = '';
    }
  }
  
  return supabaseInstance;
};
