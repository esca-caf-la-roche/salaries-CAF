import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useAuth } from './context/AuthContext'
import { ConfigurationPage } from './pages/ConfigurationPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { UnassignedEventsPage } from './pages/UnassignedEventsPage'

function ProtectedLayout() {
  const { user, loading } = useAuth()
  if (loading) return <main className="loading-screen"><span className="spinner" /><p>Ouverture de La Cordée…</p></main>
  if (!user) return <Navigate to="/connexion" replace />
  return <Layout />
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user?.role === 'admin' ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="a-determiner" element={<AdminRoute><UnassignedEventsPage /></AdminRoute>} />
        <Route path="configuration" element={<AdminRoute><ConfigurationPage /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
