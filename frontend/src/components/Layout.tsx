import { Link, useLocation } from 'react-router-dom'
import { Car, Wrench, Bell, Search, FileText } from 'lucide-react'
import ChatWidget from './ChatWidget'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()

  const navItems = [
    { path: '/', label: 'Dashboard', icon: Car },
    { path: '/maintenance', label: 'Maintenance', icon: Wrench },
    { path: '/reminders', label: 'Reminders', icon: Bell },
    { path: '/documents', label: 'Documents', icon: FileText },
    { path: '/search', label: 'Ask', icon: Search },
  ]

  return (
    <div className="min-h-screen">
      <nav className="bg-toyota-black text-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Car className="h-8 w-8 text-toyota-red" />
              <span className="text-xl font-bold">DriveIQ</span>
            </Link>
            <div className="flex gap-1">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                    location.pathname === path
                      ? 'bg-toyota-red text-white'
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
        {children}
      </main>
      <ChatWidget />
    </div>
  )
}
