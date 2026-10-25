import { useTranslation } from 'react-i18next'
import { RSVP_ANSWERS, type RsvpStatus } from '../lib/types'

interface Props {
  value: RsvpStatus
  disabled?: boolean
  onChange: (status: RsvpStatus) => void
}

/** One tap answers. Tapping the current answer again keeps it (no accidental clearing). */
export default function RsvpButtons({ value, disabled, onChange }: Props) {
  const { t } = useTranslation()
  return (
    <div className="rsvp" role="group">
      {RSVP_ANSWERS.map((status) => (
        <button
          key={status}
          type="button"
          className={`rsvp-btn rsvp-${status}${value === status ? ' active' : ''}`}
          aria-pressed={value === status}
          disabled={disabled}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (value !== status) onChange(status)
          }}
        >
          {t(`rsvp.${status}`)}
        </button>
      ))}
    </div>
  )
}
