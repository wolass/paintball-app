export type TeamRole = 'owner' | 'coach' | 'player'
export type EventKind = 'practice' | 'tournament' | 'meeting' | 'other'
export type RsvpStatus = 'pending' | 'going' | 'late' | 'maybe' | 'not_going'
export type AbsenceReason = 'holiday' | 'injury' | 'work' | 'sick' | 'other'
export type PlayerPosition = 'front' | 'snake' | 'dorito' | 'mid' | 'back' | 'flex'

export const RSVP_ANSWERS: RsvpStatus[] = ['going', 'late', 'maybe', 'not_going']
export const EVENT_KINDS: EventKind[] = ['practice', 'tournament', 'meeting', 'other']
export const ABSENCE_REASONS: AbsenceReason[] = ['holiday', 'injury', 'sick', 'work', 'other']
export const POSITIONS: PlayerPosition[] = ['front', 'snake', 'dorito', 'mid', 'back', 'flex']

export interface Profile {
  id: string
  display_name: string
  locale: string
  primary_position: PlayerPosition
}

export interface Team {
  id: string
  name: string
  timezone: string
  default_players_per_side: number
  invite_code: string
}

export interface Membership {
  team_id: string
  user_id: string
  role: TeamRole
  jersey_number: string | null
  teams: Team
}

export interface TeamEvent {
  id: string
  team_id: string
  series_id: string | null
  kind: EventKind
  title: string
  location: string | null
  notes: string | null
  starts_at: string
  ends_at: string | null
  players_per_side: number | null
  league: string | null
  format: string | null
  roster_limit: number | null
  rsvp_locks_at: string | null
  cancelled: boolean
}

export interface Attendance {
  event_id: string
  user_id: string
  status: RsvpStatus
  comment: string | null
  absence_id: string | null
  responded_at: string | null
}

export interface EventSeries {
  id: string
  team_id: string
  kind: EventKind
  title: string
  location: string | null
  weekdays: number[]
  interval_weeks: number
  start_time: string
  duration_minutes: number
  starts_on: string
  ends_on: string | null
  notes: string | null
  players_per_side: number | null
  rsvp_lock_hours: number | null
}

export interface Absence {
  id: string
  user_id: string
  starts_on: string
  ends_on: string
  reason: AbsenceReason
  note: string | null
}
