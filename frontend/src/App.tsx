import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Maintenance from './pages/Maintenance'
import Reminders from './pages/Reminders'
import Search from './pages/Search'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/search" element={<Search />} />
      </Routes>
    </Layout>
  )
}

export default App
