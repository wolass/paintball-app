import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import ErrorNote from '../components/ErrorNote'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendLink(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // Keep the path (e.g. /join?code=...) so invite links still work after signing in.
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.href },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  // The email also contains a 6-digit code. Typing it works inside the installed app,
  // where tapping the link would open the normal browser instead.
  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError(error.message)
  }

  return (
    <main className="page narrow">
      <h1>{t('app.name')}</h1>
      <h2>{t('login.title')}</h2>
      {!sent ? (
        <form onSubmit={sendLink} className="stack">
          <p className="muted">{t('login.intro')}</p>
          <label>
            {t('login.email')}
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="primary" disabled={busy}>{t('login.send')}</button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="stack">
          <p>{t('login.sent', { email })}</p>
          <label>
            {t('login.code')}
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button className="primary" disabled={busy || code.trim().length < 6}>{t('login.verify')}</button>
        </form>
      )}
      <ErrorNote error={error} />
    </main>
  )
}
