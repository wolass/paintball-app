import { describe, expect, it } from 'vitest'
import { fromZonedParts, toZonedParts } from './format'

describe('time zone conversion', () => {
  it('reads an instant as Berlin wall-clock time', () => {
    expect(toZonedParts('2026-11-01T09:00:00Z', 'Europe/Berlin')).toEqual({ date: '2026-11-01', time: '10:00' })
    expect(toZonedParts('2026-07-01T08:00:00Z', 'Europe/Warsaw')).toEqual({ date: '2026-07-01', time: '10:00' })
  })

  it('turns Berlin wall-clock time into the right instant in winter and summer', () => {
    expect(fromZonedParts('2026-11-01', '10:00', 'Europe/Berlin')).toBe('2026-11-01T09:00:00.000Z')
    expect(fromZonedParts('2026-07-01', '10:00', 'Europe/Berlin')).toBe('2026-07-01T08:00:00.000Z')
  })
})
