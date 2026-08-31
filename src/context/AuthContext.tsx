import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { demoUser } from '../data/demo'
import { isDemoMode, supabase } from '../lib/supabase'
import type { AppUser } from '../types'

interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  isDemo: boolean
  requestOtp: (email: string) => Promise<void>
  verifyOtp: (email: string, token: string) => Promise<void>
  signInDemo: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function userFromSession(session: Session): Promise<AppUser | null> {
  const metadata = session.user.user_metadata
  let role: AppUser['role'] = 'employee'
  let displayName = metadata.full_name ?? session.user.email?.split('@')[0] ?? 'Utilisateur'

  if (supabase) {
    const { data } = await supabase.from('profiles').select('role, display_name, active').eq('id', session.user.id).maybeSingle()
    if (!data?.active) return null
    role = data.role === 'employee' ? 'employee' : 'admin'
    displayName = data.display_name ?? displayName
  }
  return { id: session.user.id, email: session.user.email ?? '', displayName, role }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(!isDemoMode)

  useEffect(() => {
    if (!supabase || isDemoMode) return
    void supabase.auth.getSession().then(async ({ data }) => {
      setUser(data.session ? await userFromSession(data.session) : null)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        setUser(session ? await userFromSession(session) : null)
        setLoading(false)
      })()
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    isDemo: isDemoMode,
    requestOtp: async (email) => {
      if (!supabase) throw new Error('Supabase n\'est pas configuré.')
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      })
      if (error) throw error
    },
    verifyOtp: async (email, token) => {
      if (!supabase) throw new Error('Supabase n\'est pas configuré.')
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
      if (error) throw error
      if (!data.session) throw new Error('Le code n\'a pas créé de session.')
      const signedInUser = await userFromSession(data.session)
      if (!signedInUser) {
        await supabase.auth.signOut()
        throw new Error('Ce compte n\'est pas autorisé ou a été désactivé.')
      }
      setUser(signedInUser)
    },
    signInDemo: () => setUser(demoUser),
    signOut: async () => {
      if (supabase && !isDemoMode) await supabase.auth.signOut()
      setUser(null)
    },
  }), [loading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Le provider et son hook restent ensemble afin de garder le contrat d'authentification local.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return context
}
