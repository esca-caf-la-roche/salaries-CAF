import { useState, type FormEvent } from 'react'
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { user, requestOtp, verifyOtp, signInDemo, isDemo } = useAuth()
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (step === 'email') {
        await requestOtp(email)
        setStep('code')
      } else {
        await verifyOtp(email, token)
      }
    }
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
          <h2>{step === 'email' ? 'Connexion' : 'Saisissez le code'}</h2>
          <p className="muted">{step === 'email' ? 'Un code à 6 chiffres sera envoyé aux comptes autorisés.' : `Code envoyé à ${email}`}</p>
          {error && <div className="alert alert--error" role="alert">{error}</div>}
          {!isDemo && <>
            {step === 'email' ? (
              <label>Adresse e-mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            ) : (
              <label>Code à 6 chiffres<input className="otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus value={token} onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
            )}
            <button className="button button--primary" disabled={submitting} type="submit">
              {submitting ? 'Vérification…' : step === 'email' ? 'Recevoir mon code' : 'Valider le code'} <ArrowRight aria-hidden="true" />
            </button>
            {step === 'code' && <button className="login-link" type="button" onClick={() => { setStep('email'); setToken(''); setError('') }}>Utiliser une autre adresse</button>}
          </>}
          {isDemo && <button className="button button--primary" type="button" onClick={signInDemo}>Ouvrir la démonstration <ArrowRight aria-hidden="true" /></button>}
          <p className="security-note"><ShieldCheck aria-hidden="true" /> Authentification sécurisée par Supabase</p>
        </form>
      </section>
    </main>
  )
}
