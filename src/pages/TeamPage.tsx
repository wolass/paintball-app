import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import ErrorNote from '../components/ErrorNote'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { Profile, TeamRole } from '../lib/types'

interface Member {
  user_id: string
  role: TeamRole
  jersey_number: string | null
}

const ROLES: TeamRole[] = ['owner', 'coach', 'player']
const TIMEZONES = ['Europe/Berlin', 'Europe/Warsaw', 'Europe/Vienna', 'Europe/Zurich', 'Europe/London', 'America/New_York']

export default function TeamPage() {
  const { t } = useTranslation()
  const { team, membership, isStaff, session, refresh } = useSession()
  const userId = session!.user.id
  const [members, setMembers] = useState<Member[]>([])
  const [people, setPeople] = useState<Record<string, Profile>>({})
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState({ name: '', timezone: '', players: 5 })

  const load = useCallback(async () => {
    if (!team) return
    const { data, error } = await supabase.from('team_members').select('user_id, role, jersey_number').eq('team_id', team.id)
    if (error) return setError(error.message)
    setMembers(data as Member[])
    const { data: profiles } = await supabase.from('profiles').select('*').in('id', data.map((m) => m.user_id))
    setPeople(Object.fromEntries((profiles ?? []).map((p: Profile) => [p.id, p])))
  }, [team])

  useEffect(() => {
    void load()
    if (team) setSettings({ name: team.name, timezone: team.timezone, players: team.default_players_per_side })
  }, [load, team])

  if (!team || !membership) return null
  const teamId = team.id
  const isOwner = membership.role === 'owner'
  const inviteLink = `${window.location.origin}/join?code=${team.invite_code}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt(t('team.copyLink'), inviteLink)
    }
  }

  async function run(promise: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await promise
    setError(error?.message ?? null)
    await refresh()
    await load()
  }

  const updateMember = (m: Member, patch: Partial<Member>) =>
    run(supabase.from('team_members').update(patch).eq('team_id', teamId).eq('user_id', m.user_id))

  async function removeMember(m: Member) {
    if (!window.confirm(m.user_id === userId ? t('team.leave') + '?' : t('team.remove') + '?')) return
    await run(supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', m.user_id))
  }

  const sorted = [...members].sort(
    (a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) ||
      (people[a.user_id]?.display_name ?? '').localeCompare(people[b.user_id]?.display_name ?? ''),
  )

  return (
    <>
      <h1>{team.name}</h1>

      <section className="card stack">
        <h2>{t('team.invite')}</h2>
        <p className="muted">{t('team.inviteHint')}</p>
        <p className="invite-code">{team.invite_code}</p>
        <div className="actions">
          <button className="primary" onClick={copy}>{copied ? t('team.copied') : t('team.copyLink')}</button>
          {isOwner && <button onClick={() => run(supabase.rpc('regenerate_invite_code', { p_team: team.id }))}>{t('team.newCode')}</button>}
        </div>
      </section>

      <h2>{t('team.members')} ({members.length})</h2>
      <ul className="people">
        {sorted.map((m) => (
          <li key={m.user_id}>
            {isStaff ? (
              <input className="jersey" aria-label={t('team.jersey')} defaultValue={m.jersey_number ?? ''} placeholder="#"
                onBlur={(e) => e.target.value !== (m.jersey_number ?? '') && updateMember(m, { jersey_number: e.target.value || null })} />
            ) : (
              <span className="jersey">{m.jersey_number ?? ''}</span>
            )}
            <span className="who">
              {people[m.user_id]?.display_name}
              {people[m.user_id] && <small className="comment">{t(`profile.positions.${people[m.user_id].primary_position}`)}</small>}
            </span>
            {isStaff && (isOwner || m.role !== 'owner') ? (
              <select value={m.role} onChange={(e) => updateMember(m, { role: e.target.value as TeamRole })}>
                {ROLES.filter((r) => isOwner || r !== 'owner').map((r) => <option key={r} value={r}>{t(`team.roles.${r}`)}</option>)}
              </select>
            ) : (
              <span className="status-label">{t(`team.roles.${m.role}`)}</span>
            )}
            {(m.user_id === userId || (isStaff && m.role !== 'owner')) && (
              <button className="danger small" title={m.user_id === userId ? t('team.leave') : t('team.remove')}
                onClick={() => removeMember(m)}>✕</button>
            )}
          </li>
        ))}
      </ul>
      <ErrorNote error={error} />

      {isStaff && (
        <form className="card stack" onSubmit={(e) => {
          e.preventDefault()
          void run(supabase.from('teams').update({
            name: settings.name.trim(), timezone: settings.timezone, default_players_per_side: settings.players,
          }).eq('id', team.id))
        }}>
          <h2>{t('team.settings')}</h2>
          <label>
            {t('onboarding.teamName')}
            <input value={settings.name} required onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))} />
          </label>
          <div className="row">
            <label>
              {t('team.timezone')}
              <select value={settings.timezone} onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value }))}>
                {[...new Set([settings.timezone, ...TIMEZONES])].map((z) => <option key={z}>{z}</option>)}
              </select>
            </label>
            <label>
              {t('team.defaultPlayers')}
              <input type="number" min={1} max={15} value={settings.players}
                onChange={(e) => setSettings((s) => ({ ...s, players: Number(e.target.value) }))} />
            </label>
          </div>
          <button className="primary">{t('common.save')}</button>
        </form>
      )}

      <p><Link to="/join">{t('team.addTeam')}</Link></p>
    </>
  )
}
