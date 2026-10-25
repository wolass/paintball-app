import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import ErrorNote from '../components/ErrorNote'
import { LANGUAGES } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { POSITIONS, type PlayerPosition } from '../lib/types'

export default function ProfilePage() {
  const { t, i18n } = useTranslation()
  const { profile, session, refresh } = useSession()
  const [name, setName] = useState('')
  const [position, setPosition] = useState<PlayerPosition>('flex')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setName(profile.display_name)
      setPosition(profile.primary_position)
    }
  }, [profile])

  if (!profile) return null

  async function save(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('profiles')
      .update({ display_name: name.trim(), primary_position: position }).eq('id', profile!.id)
    setError(error?.message ?? null)
    setSaved(!error)
    await refresh()
  }

  async function setLanguage(code: string) {
    await i18n.changeLanguage(code)
    await supabase.from('profiles').update({ locale: code }).eq('id', profile!.id)
    await refresh()
  }

  return (
    <>
      <h1>{t('profile.title')}</h1>
      <p className="muted small">{session?.user.email}</p>
      <form onSubmit={save} className="card stack">
        <label>
          {t('profile.name')}
          <input value={name} required onChange={(e) => { setName(e.target.value); setSaved(false) }} />
        </label>
        <label>
          {t('profile.position')}
          <select value={position} onChange={(e) => { setPosition(e.target.value as PlayerPosition); setSaved(false) }}>
            {POSITIONS.map((p) => <option key={p} value={p}>{t(`profile.positions.${p}`)}</option>)}
          </select>
        </label>
        <button className="primary">{saved ? '✓' : t('common.save')}</button>
      </form>
      <ErrorNote error={error} />

      <section className="card stack">
        <h2>{t('profile.language')}</h2>
        <div className="segmented">
          {LANGUAGES.map((l) => (
            <button key={l.code} className={i18n.resolvedLanguage === l.code ? 'active' : ''} onClick={() => setLanguage(l.code)}>
              {l.label}
            </button>
          ))}
        </div>
      </section>

      <button className="danger" onClick={() => supabase.auth.signOut()}>{t('profile.signOut')}</button>
    </>
  )
}
