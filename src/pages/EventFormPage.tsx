import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import ErrorNote from '../components/ErrorNote'
import { fromZonedParts, todayIso, toZonedParts } from '../lib/format'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { EVENT_KINDS, type EventKind, type TeamEvent } from '../lib/types'

interface Form {
  kind: EventKind
  title: string
  date: string
  start: string
  end: string
  location: string
  notes: string
  playersPerSide: string
  league: string
  format: string
  rosterLimit: string
  lockHours: string
}

const toNumber = (v: string) => (v.trim() === '' ? null : Number(v))

export default function EventFormPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { team } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Form>({
    kind: 'practice', title: '', date: todayIso(), start: '10:00', end: '', location: '', notes: '',
    playersPerSide: '', league: '', format: '', rosterLimit: '', lockHours: '',
  })
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => {
    if (!id || !team) return
    supabase.from('events').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) return setError(error.message)
      const e = data as TeamEvent
      const start = toZonedParts(e.starts_at, team.timezone)
      const lockHours = e.rsvp_locks_at
        ? String(Math.round((new Date(e.starts_at).getTime() - new Date(e.rsvp_locks_at).getTime()) / 3600000))
        : ''
      setForm({
        kind: e.kind, title: e.title, date: start.date, start: start.time,
        end: e.ends_at ? toZonedParts(e.ends_at, team.timezone).time : '',
        location: e.location ?? '', notes: e.notes ?? '',
        playersPerSide: e.players_per_side?.toString() ?? '', league: e.league ?? '', format: e.format ?? '',
        rosterLimit: e.roster_limit?.toString() ?? '', lockHours,
      })
    })
  }, [id, team])

  if (!team) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!team) return
    const startsAt = fromZonedParts(form.date, form.start, team.timezone)
    let endsAt = form.end ? fromZonedParts(form.date, form.end, team.timezone) : null
    // An end time before the start means the event runs past midnight.
    if (endsAt && endsAt < startsAt) endsAt = new Date(new Date(endsAt).getTime() + 86400000).toISOString()
    const lock = toNumber(form.lockHours)
    const row = {
      kind: form.kind,
      title: form.title.trim(),
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
      starts_at: startsAt,
      ends_at: endsAt,
      players_per_side: toNumber(form.playersPerSide),
      league: form.league.trim() || null,
      format: form.format.trim() || null,
      roster_limit: toNumber(form.rosterLimit),
      rsvp_locks_at: lock === null ? null : new Date(new Date(startsAt).getTime() - lock * 3600000).toISOString(),
    }
    const { data, error } = id
      ? await supabase.from('events').update(row).eq('id', id).select('id').single()
      : await supabase.from('events').insert({ ...row, team_id: team.id }).select('id').single()
    if (error) setError(error.message)
    else navigate(`/events/${data.id}`, { replace: true })
  }

  const isTournament = form.kind === 'tournament'

  return (
    <form onSubmit={submit} className="stack">
      <h1>{id ? t('common.edit') : t('events.new')}</h1>
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
      <div className="row">
        <label>
          {t('events.date')}
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} required />
        </label>
        <label>
          {t('events.start')}
          <input type="time" value={form.start} onChange={(e) => set({ start: e.target.value })} required />
        </label>
        <label>
          {t('events.end')}
          <input type="time" value={form.end} onChange={(e) => set({ end: e.target.value })} />
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
      {isTournament && (
        <div className="row">
          <label>
            {t('events.league')}
            <input value={form.league} placeholder="ICS, NXL, ALPS…" onChange={(e) => set({ league: e.target.value })} />
          </label>
          <label>
            {t('events.format')}
            <input value={form.format} placeholder={t('events.formatPlaceholder')} onChange={(e) => set({ format: e.target.value })} />
          </label>
          <label>
            {t('events.rosterLimit')}
            <input type="number" min={1} value={form.rosterLimit} onChange={(e) => set({ rosterLimit: e.target.value })} />
          </label>
        </div>
      )}
      <label>
        {t('events.notes')}
        <textarea rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      <ErrorNote error={error} />
      <div className="actions">
        <button type="button" onClick={() => navigate(-1)}>{t('common.cancel')}</button>
        <button className="primary">{t('common.save')}</button>
      </div>
    </form>
  )
}
