import { CalendarClock, CalendarRange, Gauge, LogOut, Settings } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Logo } from './Logo'

export function Layout() {
  const { user, signOut, isDemo } = useAuth()
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Aller au contenu</a>
      <aside className="sidebar">
        <Logo />
        <nav className="main-nav" aria-label="Navigation principale">
          <NavLink to="/" end><Gauge aria-hidden="true" /> <span>Vue d'ensemble</span></NavLink>
          {user?.role === 'admin' && <NavLink to="/a-determiner"><CalendarClock aria-hidden="true" /> <span>À déterminer</span></NavLink>}
          {user?.role === 'admin' && <NavLink to="/configuration"><Settings aria-hidden="true" /> <span>Configuration</span></NavLink>}
        </nav>
        <div className="sidebar__foot">
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
          <NavLink to="/" end><Gauge aria-hidden="true" /><span>Heures</span></NavLink>
          {user?.role === 'admin' && <NavLink to="/a-determiner"><CalendarClock aria-hidden="true" /><span>À déterminer</span></NavLink>}
          {user?.role === 'admin' && <NavLink to="/configuration"><CalendarRange aria-hidden="true" /><span>Ressources</span></NavLink>}
        </nav>
      </div>
    </div>
  )
}
