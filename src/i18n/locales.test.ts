import { describe, expect, it } from 'vitest'
import de from './locales/de.json'
import en from './locales/en.json'

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}

describe('translations', () => {
  it('German has exactly the same keys as English', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort())
  })
})
