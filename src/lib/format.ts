import i18n from '../i18n'

export function formatEventDate(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone,
  }).format(new Date(iso))
}

export function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso))
}

export function formatDay(isoDate: string) {
  return new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${isoDate}T00:00:00Z`))
}

/** Splits an instant into the date and time as seen in the team's time zone, for form inputs. */
export function toZonedParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone,
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

/** The instant at which the given wall-clock date and time happen in the team's time zone. */
export function fromZonedParts(date: string, time: string, timeZone: string) {
  const asUtc = new Date(`${date}T${time}:00Z`)
  // Find the zone offset at that moment and correct for it (twice, to settle across DST changes).
  let guess = asUtc.getTime()
  for (let i = 0; i < 2; i++) {
    const { date: d, time: t } = toZonedParts(new Date(guess).toISOString(), timeZone)
    const shown = new Date(`${d}T${t}:00Z`).getTime()
    guess += asUtc.getTime() - shown
  }
  return new Date(guess).toISOString()
}

/** Today's date on this device, as YYYY-MM-DD. */
export function todayIso() {
  return new Date().toLocaleDateString('en-CA')
}
