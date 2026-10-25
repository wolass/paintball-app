import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import i18n from '../i18n'
import { supabase } from './supabase'
import type { Membership, Profile, Team } from './types'

interface SessionState {
  session: Session | null
  profile: Profile | null
  memberships: Membership[]
  team: Team | null
  membership: Membership | null
  isStaff: boolean
  loading: boolean
  selectTeam: (teamId: string) => void
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionState | null>(null)
const TEAM_KEY = 'currentTeamId'

function readStoredTeam() {
  try {
    return localStorage.getItem(TEAM_KEY)
  } catch {
    return null
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [teamId, setTeamId] = useState<string | null>(readStoredTeam)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null)
      setMemberships([])
      setLoading(false)
      return
    }
    const [profileRes, membersRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('team_members').select('*, teams(*)').eq('user_id', userId).order('joined_at'),
    ])
    const p = profileRes.data as Profile | null
    setProfile(p)
    setMemberships((membersRes.data ?? []) as Membership[])
    if (p?.locale && p.locale !== i18n.language) void i18n.changeLanguage(p.locale)
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      void load(data.session?.user.id)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      void load(s?.user.id)
    })
    return () => data.subscription.unsubscribe()
  }, [load])

  const selectTeam = useCallback((id: string) => {
    setTeamId(id)
    try {
      localStorage.setItem(TEAM_KEY, id)
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }, [])

  const membership = memberships.find((m) => m.team_id === teamId) ?? memberships[0] ?? null
  const value: SessionState = {
    session,
    profile,
    memberships,
    membership,
    team: membership?.teams ?? null,
    isStaff: membership?.role === 'owner' || membership?.role === 'coach',
    loading,
    selectTeam,
    refresh: () => load(session?.user.id),
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
