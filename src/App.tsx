import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useAuth } from './context/AuthContext'
import { ConfigurationPage } from './pages/ConfigurationPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'

function ProtectedLayout() {
  const { user, loading } = useAuth()
  if (loading) return <main className="loading-screen"><span className="spinner" /><p>Ouverture de La Cordée…</p></main>
  if (!user) return <Navigate to="/connexion" replace />
  return <Layout />
}

function AdminRoute() {
  const { user } = useAuth()
  return user?.role === 'admin' ? <ConfigurationPage /> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="configuration" element={<AdminRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
