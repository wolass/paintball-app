import type { Attendance, RsvpStatus } from './types'

export type StatusCounts = Record<RsvpStatus, number>

export function countStatuses(rows: Pick<Attendance, 'status'>[]): StatusCounts {
  const counts: StatusCounts = { pending: 0, going: 0, late: 0, maybe: 0, not_going: 0 }
  for (const row of rows) counts[row.status]++
  return counts
}

/** "7 confirmed with 5 per side" is 1 full line and 2 subs. Late arrivals count as confirmed. */
export function lineBreakdown(confirmed: number, playersPerSide: number) {
  if (playersPerSide <= 0) return { lines: 0, subs: confirmed, missing: 0 }
  const lines = Math.floor(confirmed / playersPerSide)
  const subs = confirmed % playersPerSide
  const missing = lines === 0 ? playersPerSide - confirmed : 0
  return { lines, subs, missing }
}

export function isLocked(rsvpLocksAt: string | null, now = new Date()) {
  return rsvpLocksAt !== null && new Date(rsvpLocksAt) <= now
}
