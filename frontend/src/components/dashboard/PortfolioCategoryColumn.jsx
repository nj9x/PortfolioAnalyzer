import { Shield, Scale, Rocket } from 'lucide-react'
import PortfolioOverviewCard from './PortfolioOverviewCard'

const CATEGORY_CONFIG = {
  conservative: {
    label: 'Conservative',
    icon: Shield,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  balanced: {
    label: 'Balanced',
    icon: Scale,
    color: 'text-gray-700',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
  },
  'high-growth': {
    label: 'High Growth',
    icon: Rocket,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
  },
}

export default function PortfolioCategoryColumn({ category, portfolios, onSelectPortfolio }) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.balanced
  const Icon = config.icon

  return (
    <div className="space-y-2">
      {/* Category header */}
      <div className={`rounded-lg px-3 py-2 ${config.bg} border ${config.border} flex items-center gap-2`}>
        <Icon size={14} className={config.color} />
        <h3 className={`text-xs font-bold ${config.color}`}>{config.label}</h3>
        <span className="ml-auto text-[10px] text-gray-500 bg-white rounded-full px-1.5 py-0.5">
          {portfolios.length}
        </span>
      </div>

      {/* Portfolio cards */}
      {portfolios.length > 0 ? (
        <div className="space-y-2">
          {portfolios.map((p) => (
            <PortfolioOverviewCard
              key={p.id}
              portfolio={p}
              onClick={() => onSelectPortfolio(p.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-gray-400 text-[11px]">
          No portfolios
        </div>
      )}
    </div>
  )
}
