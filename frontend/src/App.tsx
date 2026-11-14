import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Maintenance from './pages/Maintenance'
import Reminders from './pages/Reminders'
import Search from './pages/Search'
import Documents from './pages/Documents'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/search" element={<Search />} />
        <Route path="/documents" element={<Documents />} />
      </Routes>
    </Layout>
  )
}

export default App
