import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'
import { useSession } from '../lib/session'

export default function Layout() {
  const { t } = useTranslation()
  const { team, memberships, selectTeam } = useSession()

  return (
    <div className="shell">
      <header className="topbar">
        {memberships.length > 1 ? (
          <select
            className="team-switch"
            aria-label={t('team.switch')}
            value={team?.id}
            onChange={(e) => selectTeam(e.target.value)}
          >
            {memberships.map((m) => (
              <option key={m.team_id} value={m.team_id}>{m.teams.name}</option>
            ))}
          </select>
        ) : (
          <span className="team-name">{team?.name}</span>
        )}
      </header>
      <main className="page">
        <Outlet />
      </main>
      <nav className="tabbar">
        <NavLink to="/" end>{t('nav.events')}</NavLink>
        <NavLink to="/absences">{t('nav.absences')}</NavLink>
        <NavLink to="/team">{t('nav.team')}</NavLink>
        <NavLink to="/profile">{t('nav.profile')}</NavLink>
      </nav>
    </div>
  )
}
