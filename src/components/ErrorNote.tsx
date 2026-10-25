import { useTranslation } from 'react-i18next'

export default function ErrorNote({ error }: { error: string | null }) {
  const { t } = useTranslation()
  if (!error) return null
  return <p className="error" role="alert">{t('common.error', { message: error })}</p>
}
