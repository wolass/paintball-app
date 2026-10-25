import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import ErrorNote from '../components/ErrorNote'
import { todayIso } from '../lib/format'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { EVENT_KINDS, type EventKind, type EventSeries } from '../lib/types'

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

interface Form {
  kind: EventKind
  title: string
  weekdays: number[]
  intervalWeeks: number
  startTime: string
  duration: string
  startsOn: string
  endsOn: string
  location: string
  notes: string
  playersPerSide: string
  lockHours: string
}

const toNumber = (v: string) => (v.trim() === '' ? null : Number(v))

export default function SeriesFormPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { team } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Form>({
    kind: 'practice', title: '', weekdays: [7], intervalWeeks: 1, startTime: '10:00', duration: '180',
    startsOn: todayIso(), endsOn: '', location: '', notes: '', playersPerSide: '', lockHours: '',
  })
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => {
    if (!id) return
    supabase.from('event_series').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) return setError(error.message)
      const s = data as EventSeries
      setForm({
        kind: s.kind, title: s.title, weekdays: s.weekdays, intervalWeeks: s.interval_weeks,
        startTime: s.start_time.slice(0, 5), duration: String(s.duration_minutes), startsOn: s.starts_on,
        endsOn: s.ends_on ?? '', location: s.location ?? '', notes: s.notes ?? '',
        playersPerSide: s.players_per_side?.toString() ?? '', lockHours: s.rsvp_lock_hours?.toString() ?? '',
      })
    })
  }, [id])

  if (!team) return null

  function toggleDay(day: number) {
    set({ weekdays: form.weekdays.includes(day) ? form.weekdays.filter((d) => d !== day) : [...form.weekdays, day].sort() })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!team || form.weekdays.length === 0) return
    const row = {
      kind: form.kind,
      title: form.title.trim(),
      weekdays: form.weekdays,
      interval_weeks: form.intervalWeeks,
      start_time: form.startTime,
      duration_minutes: Number(form.duration) || 120,
      starts_on: form.startsOn,
      ends_on: form.endsOn || null,
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
      players_per_side: toNumber(form.playersPerSide),
      rsvp_lock_hours: toNumber(form.lockHours),
    }
    const { error } = id
      ? await supabase.from('event_series').update(row).eq('id', id)
      : await supabase.from('event_series').insert({ ...row, team_id: team.id })
    if (error) setError(error.message)
    else navigate('/', { replace: true })
  }

  return (
    <form onSubmit={submit} className="stack">
      <h1>{t('series.title')}</h1>
      {id && <p className="notice">{t('series.changeWarning')}</p>}
      <label>
        {t('events.type')}
        <select value={form.kind} onChange={(e) => set({ kind: e.target.value as EventKind })}>
          {EVENT_KINDS.map((k) => <option key={k} value={k}>{t(`events.kind.${k}`)}</option>)}
        </select>
      </label>
      <label>
        {t('events.title')}
        <input value={form.title} onChange={(e) => set({ title: e.target.value })} required />
      </label>
      <fieldset>
        <legend>{t('series.weekdays')}</legend>
        <div className="days">
          {WEEKDAYS.map((d) => (
            <button key={d} type="button" className={form.weekdays.includes(d) ? 'active' : ''}
              aria-pressed={form.weekdays.includes(d)} onClick={() => toggleDay(d)}>
              {t(`weekday.${d}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="row">
        <label>
          {t('series.every')}
          <select value={form.intervalWeeks} onChange={(e) => set({ intervalWeeks: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{t('series.everyWeeks', { count: n })}</option>)}
          </select>
        </label>
        <label>
          {t('events.start')}
          <input type="time" value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} required />
        </label>
        <label>
          {t('events.duration')}
          <input type="number" min={15} step={15} value={form.duration} onChange={(e) => set({ duration: e.target.value })} />
        </label>
      </div>
      <div className="row">
        <label>
          {t('series.startsOn')}
          <input type="date" value={form.startsOn} onChange={(e) => set({ startsOn: e.target.value })} required />
        </label>
        <label>
          {t('series.endsOn')}
          <input type="date" value={form.endsOn} min={form.startsOn} onChange={(e) => set({ endsOn: e.target.value })} />
          <small className="muted">{t('series.endsOnHint')}</small>
        </label>
      </div>
      <label>
        {t('events.location')}
        <input value={form.location} onChange={(e) => set({ location: e.target.value })} />
      </label>
      <div className="row">
        <label>
          {t('events.playersPerSide')}
          <input type="number" min={1} max={15} value={form.playersPerSide}
            placeholder={String(team.default_players_per_side)} onChange={(e) => set({ playersPerSide: e.target.value })} />
        </label>
        <label>
          {t('events.lockHours')}
          <input type="number" min={0} value={form.lockHours} placeholder={t('common.optional')}
            onChange={(e) => set({ lockHours: e.target.value })} />
        </label>
      </div>
      <label>
        {t('events.notes')}
        <textarea rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      <ErrorNote error={error} />
      <div className="actions">
        <button type="button" onClick={() => navigate(-1)}>{t('common.cancel')}</button>
        <button className="primary" disabled={form.weekdays.length === 0}>{t('common.save')}</button>
      </div>
    </form>
  )
}
