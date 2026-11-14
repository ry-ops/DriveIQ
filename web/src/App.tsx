import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Car, Wrench, Sparkles, Settings as SettingsIcon } from 'lucide-react'
import { api } from '@/lib/api'
import Dashboard from './pages/Dashboard'
import Maintenance from './pages/Maintenance'
import Aiana from './pages/Aiana'
import Settings from './pages/Settings'
import SetupRequired from './components/SetupRequired'

const navItems = [
  { path: '/', label: 'Home', icon: Car },
  { path: '/maintenance', label: 'Maintenance', icon: Wrench },
  { path: '/aiana', label: 'Aiana', icon: Sparkles },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
]

export default function App() {
  const location = useLocation()
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 })
  const locked = health.data && health.data.access !== 'ok'

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-ink text-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Car className="h-8 w-8 text-accent" />
              <span className="text-xl font-bold">DriveIQ</span>
            </Link>
            <div className="flex gap-1">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                    location.pathname === path
                      ? 'bg-accent text-white'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-8">
        {locked ? (
          <SetupRequired health={health.data!} />
        ) : (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/aiana" element={<Aiana />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        )}
      </main>
    </div>
  )
}
