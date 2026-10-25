import { useTranslation } from 'react-i18next'
import { countStatuses, lineBreakdown } from '../lib/lines'
import type { Attendance } from '../lib/types'

export default function LineSummary({ rows, playersPerSide }: { rows: Pick<Attendance, 'status'>[]; playersPerSide: number }) {
  const { t } = useTranslation()
  const counts = countStatuses(rows)
  const { lines, subs, missing } = lineBreakdown(counts.going + counts.late, playersPerSide)
  return (
    <div className="line-summary">
      <span className="counts">
        <b className="c-going" title={t('rsvp.going')}>✓ {counts.going + counts.late}</b>
        <span className="c-maybe" title={t('rsvp.maybe')}>? {counts.maybe}</span>
        <span className="c-out" title={t('rsvp.not_going')}>✕ {counts.not_going}</span>
        <span className="c-pending" title={t('rsvp.pending')}>– {counts.pending}</span>
      </span>
      <span className="lines">
        {missing > 0
          ? t('lines.missing', { count: missing })
          : `${t('lines.summary', { count: lines, lines })}${subs ? ` ${t('lines.subs', { count: subs })}` : ''}`}
        <small> · {t('lines.perSide', { count: playersPerSide })}</small>
      </span>
    </div>
  )
}
