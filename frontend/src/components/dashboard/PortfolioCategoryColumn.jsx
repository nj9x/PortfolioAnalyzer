import { Shield, Scale, Rocket } from 'lucide-react'
import PortfolioOverviewCard from './PortfolioOverviewCard'

const CATEGORY_CONFIG = {
  conservative: {
    label: 'Conservative',
    icon: Shield,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    description: 'Low risk, stable income',
  },
  balanced: {
    label: 'Balanced',
    icon: Scale,
    color: 'text-gray-700',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    description: 'Moderate risk & growth',
  },
  'high-growth': {
    label: 'High Growth',
    icon: Rocket,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    description: 'Higher risk, max growth',
  },
}

export default function PortfolioCategoryColumn({ category, portfolios, onSelectPortfolio }) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.balanced
  const Icon = config.icon

  return (
    <div className="space-y-3">
      {/* Category header */}
      <div className={`rounded-xl p-3 ${config.bg} border ${config.border}`}>
        <div className="flex items-center gap-2">
          <Icon size={18} className={config.color} />
          <h3 className={`text-sm font-bold ${config.color}`}>{config.label}</h3>
          <span className="ml-auto text-xs text-gray-500 bg-white rounded-full px-2 py-0.5">
            {portfolios.length}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{config.description}</p>
      </div>

      {/* Portfolio cards */}
      {portfolios.length > 0 ? (
        <div className="space-y-3">
          {portfolios.map((p) => (
            <PortfolioOverviewCard
              key={p.id}
              portfolio={p}
              onClick={() => onSelectPortfolio(p.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400 text-xs">
          No portfolios in this category
        </div>
      )}
    </div>
  )
}
