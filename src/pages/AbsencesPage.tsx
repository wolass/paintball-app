import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import ErrorNote from '../components/ErrorNote'
import { formatDay, todayIso } from '../lib/format'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { ABSENCE_REASONS, type Absence, type AbsenceReason, type Profile } from '../lib/types'

function Range({ a }: { a: Absence }) {
  return <>{a.starts_on === a.ends_on ? formatDay(a.starts_on) : `${formatDay(a.starts_on)} – ${formatDay(a.ends_on)}`}</>
}

export default function AbsencesPage() {
  const { t } = useTranslation()
  const { session, team } = useSession()
  const userId = session!.user.id
  const [absences, setAbsences] = useState<Absence[]>([])
  const [people, setPeople] = useState<Record<string, Profile>>({})
  const [form, setForm] = useState({ from: todayIso(), to: todayIso(), reason: 'holiday' as AbsenceReason, note: '' })
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!team) return
    // Absences of everyone in the current team that haven't ended yet.
    const { data: members } = await supabase.from('team_members').select('user_id').eq('team_id', team.id)
    const ids = (members ?? []).map((m) => m.user_id as string)
    const [{ data, error }, { data: profiles }] = await Promise.all([
      supabase.from('absences').select('*').in('user_id', ids).gte('ends_on', todayIso()).order('starts_on'),
      supabase.from('profiles').select('*').in('id', ids),
    ])
    setAbsences((data ?? []) as Absence[])
    setPeople(Object.fromEntries((profiles ?? []).map((p: Profile) => [p.id, p])))
    setError(error?.message ?? null)
  }, [team])

  useEffect(() => {
    void load()
  }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('absences').insert({
      starts_on: form.from,
      ends_on: form.to < form.from ? form.from : form.to,
      reason: form.reason,
      note: form.note.trim() || null,
    })
    if (error) return setError(error.message)
    setForm((f) => ({ ...f, note: '' }))
    await load()
  }

  async function remove(id: string) {
    if (!window.confirm(t('common.confirmDelete'))) return
    const { error } = await supabase.from('absences').delete().eq('id', id)
    if (error) setError(error.message)
    await load()
  }

  const mine = absences.filter((a) => a.user_id === userId)
  const others = absences.filter((a) => a.user_id !== userId)

  return (
    <>
      <h1>{t('absences.title')}</h1>
      <p className="muted">{t('absences.intro')}</p>

      <form onSubmit={add} className="card stack">
        <div className="row">
          <label>
            {t('absences.from')}
            <input type="date" value={form.from} required
              onChange={(e) => setForm((f) => ({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to }))} />
          </label>
          <label>
            {t('absences.to')}
            <input type="date" value={form.to} min={form.from} required onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} />
          </label>
        </div>
        <label>
          {t('absences.reason')}
          <select value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value as AbsenceReason }))}>
            {ABSENCE_REASONS.map((r) => <option key={r} value={r}>{t(`absences.reasons.${r}`)}</option>)}
          </select>
        </label>
        <label>
          {t('absences.note')}
          <input value={form.note} placeholder={t('common.optional')} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </label>
        <button className="primary">{t('absences.add')}</button>
      </form>
      <ErrorNote error={error} />

      {mine.length === 0 ? (
        <p className="muted">{t('absences.none')}</p>
      ) : (
        <ul className="people">
          {mine.map((a) => (
            <li key={a.id}>
              <span className="who">
                <Range a={a} />
                <small className="comment">{t(`absences.reasons.${a.reason}`)}{a.note && ` · ${a.note}`}</small>
              </span>
              <button className="danger small" onClick={() => remove(a.id)}>{t('common.delete')}</button>
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <>
          <h2>{t('absences.teammates')}</h2>
          <ul className="people">
            {others.map((a) => (
              <li key={a.id}>
                <span className="who">
                  {people[a.user_id]?.display_name}
                  <small className="comment"><Range a={a} /> · {t(`absences.reasons.${a.reason}`)}</small>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
