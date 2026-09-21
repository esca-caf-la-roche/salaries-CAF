import { useEffect, useState } from 'react'
import { ArrowLeftRight, BriefcaseBusiness, CalendarClock, CalendarRange, Gauge, LogOut, RefreshCcw, Settings, Sigma, UserRoundCheck, Ellipsis, X } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Logo } from './Logo'
import { NotificationCenter } from './NotificationCenter'

type MobileNavItem = { to: string; icon: LucideIcon; label: string; shortLabel?: string; end?: boolean }

// Bonne pratique mobile : 3 à 5 destinations dans la barre, le reste dans « Plus ».
const adminPrimaryMobile: MobileNavItem[] = [
  { to: '/vue-ensemble', icon: Gauge, label: "Vue d'ensemble", shortLabel: 'Vue' },
  { to: '/', icon: Sigma, label: 'Suivi des heures', shortLabel: 'Suivi', end: true },
  { to: '/gerer-remplacements', icon: RefreshCcw, label: 'Gérer les remplacements', shortLabel: 'Remplacer' },
  { to: '/independants', icon: BriefcaseBusiness, label: 'Indépendants', shortLabel: 'Indép.' },
]
const adminSecondaryMobile: MobileNavItem[] = [
  { to: '/absences-remplacements', icon: UserRoundCheck, label: 'Absences & remplacements' },
  { to: '/a-determiner', icon: CalendarClock, label: 'À déterminer' },
  { to: '/conversion', icon: ArrowLeftRight, label: 'Conversion' },
  { to: '/configuration', icon: CalendarRange, label: 'Ressources' },
]
const employeePrimaryMobile: MobileNavItem[] = [
  { to: '/', icon: Sigma, label: 'Suivi des heures', shortLabel: 'Suivi', end: true },
  { to: '/conversion', icon: ArrowLeftRight, label: 'Conversion', shortLabel: 'Conversion' },
]

function MobileNavLink({ item, onClick }: { item: MobileNavItem; onClick?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} end={item.end} onClick={onClick}>
      <Icon aria-hidden="true" /><span>{item.shortLabel ?? item.label}</span>
    </NavLink>
  )
}

export function Layout() {
  const { user, signOut, isDemo } = useAuth()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const isAdmin = user?.role === 'admin'
  const primaryMobile = isAdmin ? adminPrimaryMobile : employeePrimaryMobile
  const moreActive = isAdmin && adminSecondaryMobile.some((item) => item.to === location.pathname)

  useEffect(() => { setMoreOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!moreOpen) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMoreOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [moreOpen])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Aller au contenu</a>
      <aside className="sidebar">
        <Logo />
        <nav className="main-nav" aria-label="Navigation principale">
          {user?.role === 'admin' && <NavLink to="/vue-ensemble"><Gauge aria-hidden="true" /> <span>Vue d'ensemble</span></NavLink>}
          {user?.role === 'admin' && <NavLink to="/absences-remplacements"><UserRoundCheck aria-hidden="true" /> <span>Absences & remplacements</span></NavLink>}
          {user?.role === 'admin' && <NavLink to="/gerer-remplacements"><RefreshCcw aria-hidden="true" /> <span>Gérer les remplacements</span></NavLink>}
          <NavLink to="/" end><Sigma aria-hidden="true" /> <span>Suivi des heures</span></NavLink>
          {user?.role === 'admin' && <NavLink to="/independants"><BriefcaseBusiness aria-hidden="true" /><span>Indépendants</span></NavLink>}
          {user?.role === 'admin' && <NavLink to="/a-determiner"><CalendarClock aria-hidden="true" /> <span>À déterminer</span></NavLink>}
          <NavLink to="/conversion"><ArrowLeftRight aria-hidden="true" /> <span>Conversion</span></NavLink>
          {user?.role === 'admin' && <NavLink to="/configuration"><Settings aria-hidden="true" /> <span>Configuration</span></NavLink>}
        </nav>
        <div className="sidebar__foot">
          {user && <NotificationCenter role={user.role} />}
          <div className="user-chip">
            <span className="user-chip__avatar">{user?.displayName.charAt(0)}</span>
            <span><strong>{user?.displayName}</strong><small>{user?.role === 'admin' ? 'Administrateur' : 'Salarié'}</small></span>
          </div>
          <button className="icon-button" type="button" onClick={() => void signOut()} aria-label="Se déconnecter">
            <LogOut aria-hidden="true" />
          </button>
        </div>
      </aside>
      <div className="workspace">
        {isDemo && (
          <div className="demo-banner" role="status">
            <span>Démonstration</span> Les chiffres affichés sont fictifs. Configurez Supabase pour utiliser les données réelles.
          </div>
        )}
        <header className="mobile-header"><Logo compact /><span>La Cordée</span></header>
        <main id="main-content"><Outlet /></main>
        <nav className="mobile-nav" aria-label="Navigation mobile">
          {primaryMobile.map((item) => <MobileNavLink key={item.to} item={item} />)}
          {isAdmin && (
            <div className="mobile-nav__more">
              <button
                type="button"
                className={`mobile-nav__more-button${moreActive ? ' active' : ''}`}
                aria-expanded={moreOpen}
                aria-haspopup="true"
                aria-label="Plus de navigation"
                onClick={() => setMoreOpen((open) => !open)}
              >
                {moreOpen ? <X aria-hidden="true" /> : <Ellipsis aria-hidden="true" />}
                <span>Plus</span>
              </button>
              {moreOpen && (
                <>
                  <div className="mobile-nav__backdrop" aria-hidden="true" onClick={() => setMoreOpen(false)} />
                  <div className="mobile-nav__sheet" role="menu" aria-label="Autres pages">
                    {adminSecondaryMobile.map((item) => {
                      const Icon = item.icon
                      return (
                        <NavLink key={item.to} to={item.to} role="menuitem" className="mobile-nav__sheet-item" onClick={() => setMoreOpen(false)}>
                          <Icon aria-hidden="true" /><span>{item.label}</span>
                        </NavLink>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </nav>
      </div>
    </div>
  )
}
