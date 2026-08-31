import { useState, type FormEvent } from 'react'
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { user, signIn, signInDemo, isDemo } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user?.role === 'admin') return <Navigate to="/" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try { await signIn(email, password) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Connexion impossible.') }
    finally { setSubmitting(false) }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-label="Présentation">
        <Logo />
        <div className="route-line" aria-hidden="true"><i /><i /><i /><i /></div>
        <div>
          <p className="eyebrow">Suivi du temps salarié</p>
          <h1>Chaque heure<br />trouve sa voie.</h1>
          <p>Les calendriers deviennent un relevé fiable, pondéré et lisible à l'échelle du mois comme de l'année.</p>
        </div>
        <small>Outil interne · Club alpin français</small>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <span className="login-card__icon"><LockKeyhole aria-hidden="true" /></span>
          <p className="eyebrow">Accès réservé</p>
          <h2>Connexion administrateur</h2>
          <p className="muted">Les comptes salariés seront ouverts dans une prochaine version.</p>
          {error && <div className="alert alert--error" role="alert">{error}</div>}
          {!isDemo && <>
            <label>Adresse e-mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Mot de passe<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <button className="button button--primary" disabled={submitting} type="submit">{submitting ? 'Connexion…' : 'Se connecter'} <ArrowRight aria-hidden="true" /></button>
          </>}
          {isDemo && <button className="button button--primary" type="button" onClick={signInDemo}>Ouvrir la démonstration <ArrowRight aria-hidden="true" /></button>}
          <p className="security-note"><ShieldCheck aria-hidden="true" /> Authentification sécurisée par Supabase</p>
        </form>
      </section>
    </main>
  )
}
