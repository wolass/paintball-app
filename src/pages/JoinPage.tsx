import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ErrorNote from '../components/ErrorNote'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'

/** First-run screen, and later the place to join or create another team. */
export default function JoinPage() {
  const { t } = useTranslation()
  const { profile, refresh, selectTeam } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [code, setCode] = useState(params.get('code') ?? '')
  const [teamName, setTeamName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveName() {
    if (profile && name.trim() && name.trim() !== profile.display_name) {
      await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', profile.id)
    }
  }

  async function finish(teamId: string) {
    selectTeam(teamId)
    await refresh()
    navigate('/', { replace: true })
  }

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    await saveName()
    const { data, error } = await supabase.rpc('join_team', { p_invite_code: code })
    setBusy(false)
    if (error) setError(error.code === 'P0002' ? t('onboarding.badCode') : error.message)
    else await finish(data as string)
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    await saveName()
    const { data, error } = await supabase.from('teams').insert({ name: teamName.trim() }).select('id').single()
    setBusy(false)
    if (error) setError(error.message)
    else await finish(data.id)
  }

  return (
    <main className="page narrow">
      <h1>{t('onboarding.title')}</h1>
      <label>
        {t('onboarding.name')}
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </label>

      <form onSubmit={join} className="card stack">
        <h2>{t('onboarding.join')}</h2>
        <p className="muted">{t('onboarding.joinHint')}</p>
        <label>
          {t('onboarding.code')}
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" required />
        </label>
        <button className="primary" disabled={busy}>{t('onboarding.joinButton')}</button>
      </form>

      <p className="divider">{t('onboarding.or')}</p>

      <form onSubmit={create} className="card stack">
        <h2>{t('onboarding.create')}</h2>
        <label>
          {t('onboarding.teamName')}
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} required />
        </label>
        <button disabled={busy}>{t('onboarding.createButton')}</button>
      </form>
      <ErrorNote error={error} />
    </main>
  )
}
