import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import ErrorNote from '../components/ErrorNote'
import LineSummary from '../components/LineSummary'
import RsvpButtons from '../components/RsvpButtons'
import { formatEventDate } from '../lib/format'
import { isLocked } from '../lib/lines'
import { useSession } from '../lib/session'
import { useTeamEvents } from '../lib/useTeamEvents'

export default function EventsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { team, session, isStaff } = useSession()
  const [past, setPast] = useState(false)
  const { events, loading, error, answer } = useTeamEvents(team?.id, past)
  const userId = session!.user.id

  if (!team) return null

  return (
    <>
      <div className="segmented">
        <button className={past ? '' : 'active'} onClick={() => setPast(false)}>{t('events.upcoming')}</button>
        <button className={past ? 'active' : ''} onClick={() => setPast(true)}>{t('events.past')}</button>
      </div>

      {isStaff && !past && (
        <div className="actions">
          <Link className="button" to="/events/new">+ {t('events.new')}</Link>
          <Link className="button" to="/series/new">↻ {t('events.newSeries')}</Link>
        </div>
      )}

      <ErrorNote error={error} />
      {loading && <p className="muted">{t('common.loading')}</p>}
      {!loading && events.length === 0 && <p className="muted">{t('events.none')}</p>}

      <ul className="event-list">
        {events.map((event) => {
          const mine = event.attendance.find((a) => a.user_id === userId)
          const locked = isLocked(event.rsvp_locks_at) || event.cancelled
          return (
            <li
              key={event.id}
              className={`card event kind-${event.kind}${event.cancelled ? ' cancelled' : ''}`}
              onClick={() => navigate(`/events/${event.id}`)}
            >
              <div className="event-head">
                <span className="badge">{t(`events.kind.${event.kind}`)}</span>
                <time>{formatEventDate(event.starts_at, team.timezone)}</time>
              </div>
              <h3>
                {event.title}
                {event.cancelled && <span className="tag-cancelled"> · {t('events.cancelled')}</span>}
              </h3>
              {event.location && <p className="muted small">{event.location}</p>}
              {!event.cancelled && (
                <LineSummary rows={event.attendance} playersPerSide={event.players_per_side ?? team.default_players_per_side} />
              )}
              {mine && !past && !event.cancelled && (
                <RsvpButtons value={mine.status} disabled={locked} onChange={(s) => answer(event.id, userId, s)} />
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
