import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ErrorNote from '../components/ErrorNote'
import LineSummary from '../components/LineSummary'
import RsvpButtons from '../components/RsvpButtons'
import { formatEventDate, formatTime } from '../lib/format'
import { isLocked } from '../lib/lines'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { RSVP_ANSWERS, type Attendance, type Profile, type RsvpStatus, type TeamEvent } from '../lib/types'

const ORDER: RsvpStatus[] = ['going', 'late', 'maybe', 'pending', 'not_going']

export default function EventDetailPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { team, session, isStaff } = useSession()
  const [event, setEvent] = useState<TeamEvent | null>(null)
  const [rows, setRows] = useState<Attendance[]>([])
  const [people, setPeople] = useState<Record<string, Profile>>({})
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const userId = session!.user.id

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('events').select('*, attendance(*)').eq('id', id!).single()
    if (error) return setError(error.message)
    const { attendance, ...ev } = data as TeamEvent & { attendance: Attendance[] }
    setEvent(ev)
    setRows(attendance)
    setComment(attendance.find((a) => a.user_id === userId)?.comment ?? '')
    const { data: profiles } = await supabase.from('profiles').select('*').in('id', attendance.map((a) => a.user_id))
    setPeople(Object.fromEntries((profiles ?? []).map((p: Profile) => [p.id, p])))
  }, [id, userId])

  useEffect(() => {
    void load()
  }, [load])

  async function update(forUser: string, patch: Partial<Pick<Attendance, 'status' | 'comment'>>) {
    setError(null)
    const { data, error } = await supabase
      .from('attendance')
      .update(patch)
      .eq('event_id', id!)
      .eq('user_id', forUser)
      .select()
    if (error || !data?.length) setError(error?.message ?? t('rsvp.locked'))
    await load()
  }

  async function setCancelled(cancelled: boolean) {
    const { error } = await supabase.from('events').update({ cancelled }).eq('id', id!)
    if (error) setError(error.message)
    else await load()
  }

  async function remove(series: boolean) {
    if (!event || !window.confirm(t('common.confirmDelete'))) return
    const { error } = series
      ? await supabase.from('event_series').delete().eq('id', event.series_id!)
      : await supabase.from('events').delete().eq('id', event.id)
    if (error) setError(error.message)
    else navigate('/', { replace: true })
  }

  if (!team) return null
  if (!event) return <><ErrorNote error={error} /><p className="muted">{t('common.loading')}</p></>

  const mine = rows.find((a) => a.user_id === userId)
  const locked = isLocked(event.rsvp_locks_at) || event.cancelled
  const sorted = [...rows].sort(
    (a, b) =>
      ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
      (people[a.user_id]?.display_name ?? '').localeCompare(people[b.user_id]?.display_name ?? ''),
  )

  return (
    <>
      <Link to="/" className="back">← {t('common.back')}</Link>
      <section className={`card event kind-${event.kind}${event.cancelled ? ' cancelled' : ''}`}>
        <div className="event-head">
          <span className="badge">{t(`events.kind.${event.kind}`)}</span>
          <time>
            {formatEventDate(event.starts_at, team.timezone)}
            {event.ends_at && `–${formatTime(event.ends_at, team.timezone)}`}
          </time>
        </div>
        <h1>
          {event.title}
          {event.cancelled && <span className="tag-cancelled"> · {t('events.cancelled')}</span>}
        </h1>
        {event.location && <p>{event.location}</p>}
        {(event.league || event.format) && <p className="muted">{[event.league, event.format].filter(Boolean).join(' · ')}</p>}
        {event.notes && <p className="notes">{event.notes}</p>}
        {event.series_id && <p className="muted small">↻ {t('events.recurring')}</p>}
        <LineSummary rows={rows} playersPerSide={event.players_per_side ?? team.default_players_per_side} />
        {event.rsvp_locks_at && (
          <p className="muted small">
            {locked ? t('rsvp.locked') : t('rsvp.locksAt', { when: formatEventDate(event.rsvp_locks_at, team.timezone) })}
          </p>
        )}
      </section>

      {mine && (
        <section className="card stack">
          <RsvpButtons value={mine.status} disabled={locked} onChange={(status) => update(userId, { status })} />
          <label>
            {t('rsvp.comment')}
            <input
              value={comment}
              placeholder={t('rsvp.commentPlaceholder')}
              disabled={locked}
              onChange={(e) => setComment(e.target.value)}
              onBlur={() => comment !== (mine.comment ?? '') && update(userId, { comment: comment || null })}
            />
          </label>
        </section>
      )}
      <ErrorNote error={error} />

      <h2>{t('events.answers')}</h2>
      <ul className="people">
        {sorted.map((a) => (
          <li key={a.user_id} className={`status-${a.status}`}>
            <span className="dot" />
            <span className="who">
              {people[a.user_id]?.display_name || '…'}
              {a.absence_id && <small className="muted"> ({t('rsvp.absence')})</small>}
              {a.comment && <small className="comment">{a.comment}</small>}
            </span>
            {isStaff ? (
              <select
                aria-label={t('events.answerFor', { name: people[a.user_id]?.display_name })}
                value={a.status}
                onChange={(e) => update(a.user_id, { status: e.target.value as RsvpStatus })}
              >
                {['pending', ...RSVP_ANSWERS].map((s) => (
                  <option key={s} value={s}>{t(`rsvp.${s}`)}</option>
                ))}
              </select>
            ) : (
              <span className="status-label">{t(`rsvp.${a.status}`)}</span>
            )}
          </li>
        ))}
      </ul>

      {isStaff && (
        <div className="actions wrap">
          <Link className="button" to={`/events/${event.id}/edit`}>{t('common.edit')}</Link>
          {event.series_id && <Link className="button" to={`/series/${event.series_id}/edit`}>{t('events.editSeries')}</Link>}
          <button onClick={() => setCancelled(!event.cancelled)}>{event.cancelled ? t('events.uncancel') : t('events.cancel')}</button>
          <button className="danger" onClick={() => remove(false)}>{t('common.delete')}</button>
          {event.series_id && <button className="danger" onClick={() => remove(true)}>{t('events.deleteSeries')}</button>}
        </div>
      )}
    </>
  )
}
