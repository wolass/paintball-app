import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { isConfigured } from './lib/supabase'
import { useSession } from './lib/session'
import AbsencesPage from './pages/AbsencesPage'
import EventDetailPage from './pages/EventDetailPage'
import EventFormPage from './pages/EventFormPage'
import EventsPage from './pages/EventsPage'
import JoinPage from './pages/JoinPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import SeriesFormPage from './pages/SeriesFormPage'
import TeamPage from './pages/TeamPage'

export default function App() {
  const { t } = useTranslation()
  const { session, memberships, loading } = useSession()

  if (!isConfigured) {
    return (
      <main className="page narrow">
        <h1>{t('setup.title')}</h1>
        <p>{t('setup.body')}</p>
      </main>
    )
  }
  if (loading) return <main className="page narrow muted">{t('common.loading')}</main>
  if (!session) return <LoginPage />
  if (memberships.length === 0) return <JoinPage />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<EventsPage />} />
        <Route path="events/new" element={<EventFormPage />} />
        <Route path="events/:id" element={<EventDetailPage />} />
        <Route path="events/:id/edit" element={<EventFormPage />} />
        <Route path="series/new" element={<SeriesFormPage />} />
        <Route path="series/:id/edit" element={<SeriesFormPage />} />
        <Route path="absences" element={<AbsencesPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="join" element={<JoinPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
