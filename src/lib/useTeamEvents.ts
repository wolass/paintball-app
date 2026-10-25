import { useCallback, useEffect, useState } from 'react'
import i18n from '../i18n'
import { supabase } from './supabase'
import type { Attendance, RsvpStatus, TeamEvent } from './types'

export type EventWithAttendance = TeamEvent & { attendance: Attendance[] }

/** Upcoming (or past) events of a team, with everyone's answers. Reloads when the app regains focus. */
export function useTeamEvents(teamId: string | undefined, past: boolean) {
  const [events, setEvents] = useState<EventWithAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!teamId) return
    // Events stay "upcoming" until a few hours after they start.
    const cutoff = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
    let query = supabase.from('events').select('*, attendance(*)').eq('team_id', teamId)
    query = past
      ? query.lt('starts_at', cutoff).order('starts_at', { ascending: false }).limit(30)
      : query.gte('starts_at', cutoff).order('starts_at').limit(40)
    const { data, error } = await query
    setEvents((data ?? []) as EventWithAttendance[])
    setError(error?.message ?? null)
    setLoading(false)
  }, [teamId, past])

  useEffect(() => {
    void load()
    const onFocus = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [load])

  /** Optimistic answer: the button changes at once, and rolls back if the server refuses. */
  const answer = useCallback(
    async (eventId: string, userId: string, status: RsvpStatus) => {
      const before = events
      setEvents((list) =>
        list.map((e) =>
          e.id !== eventId
            ? e
            : { ...e, attendance: e.attendance.map((a) => (a.user_id === userId ? { ...a, status, absence_id: null } : a)) },
        ),
      )
      const { data, error } = await supabase
        .from('attendance')
        .update({ status })
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .select()
      if (error || !data?.length) {
        setEvents(before)
        setError(error?.message ?? i18n.t('rsvp.locked'))
      }
    },
    [events],
  )

  return { events, loading, error, reload: load, answer }
}
