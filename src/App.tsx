import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useAuth } from './context/AuthContext'
import { ConfigurationPage } from './pages/ConfigurationPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'

function ProtectedLayout() {
  const { user, loading } = useAuth()
  if (loading) return <main className="loading-screen"><span className="spinner" /><p>Ouverture de La Cordée…</p></main>
  if (!user || user.role !== 'admin') return <Navigate to="/connexion" replace />
  return <Layout />
}

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="configuration" element={<ConfigurationPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
