import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Briefcase, Radio, BrainCircuit, ImagePlus, Calculator } from 'lucide-react'
import clsx from 'clsx'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/portfolios', label: 'Portfolios', icon: Briefcase },
  { to: '/signals', label: 'Market Signals', icon: Radio },
  { to: '/analysis', label: 'AI Analysis', icon: BrainCircuit },
  { to: '/chart-analysis', label: 'Chart Analysis', icon: ImagePlus },
  { to: '/dcf', label: 'DCF Valuation', icon: Calculator },
]

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 text-gray-100 flex flex-col min-h-screen">
      <div className="px-6 py-5 border-b border-gray-700">
        <h1 className="text-xl font-bold tracking-tight">Portfolio Analyzer</h1>
        <p className="text-xs text-gray-400 mt-1">AI-Powered Advisory Tool</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
