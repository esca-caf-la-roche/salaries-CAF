import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true' || !isSupabaseConfigured

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      // L'authentification utilise exclusivement le code OTP saisi dans
      // l'application. Aucun jeton provenant d'un Magic Link n'est accepté.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null
