import { describe, expect, it } from 'vitest'
import { countStatuses, isLocked, lineBreakdown } from './lines'

describe('lineBreakdown', () => {
  it('splits confirmed players into lines and subs', () => {
    expect(lineBreakdown(7, 5)).toEqual({ lines: 1, subs: 2, missing: 0 })
    expect(lineBreakdown(10, 5)).toEqual({ lines: 2, subs: 0, missing: 0 })
    expect(lineBreakdown(20, 10)).toEqual({ lines: 2, subs: 0, missing: 0 })
    expect(lineBreakdown(4, 3)).toEqual({ lines: 1, subs: 1, missing: 0 })
  })

  it('reports how many are missing for a first line', () => {
    expect(lineBreakdown(3, 5)).toEqual({ lines: 0, subs: 3, missing: 2 })
    expect(lineBreakdown(0, 5)).toEqual({ lines: 0, subs: 0, missing: 5 })
  })
})

describe('countStatuses', () => {
  it('counts each answer', () => {
    const counts = countStatuses([{ status: 'going' }, { status: 'going' }, { status: 'late' }, { status: 'pending' }])
    expect(counts).toEqual({ pending: 1, going: 2, late: 1, maybe: 0, not_going: 0 })
  })
})

describe('isLocked', () => {
  it('is unlocked without a lock time and before it', () => {
    const now = new Date('2026-11-01T08:00:00Z')
    expect(isLocked(null, now)).toBe(false)
    expect(isLocked('2026-11-01T09:00:00Z', now)).toBe(false)
    expect(isLocked('2026-11-01T07:00:00Z', now)).toBe(true)
  })
})
