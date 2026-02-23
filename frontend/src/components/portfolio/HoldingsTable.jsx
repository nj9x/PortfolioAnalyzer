import { Trash2 } from 'lucide-react'
import { useDeleteHolding } from '../../hooks/usePortfolios'

export default function HoldingsTable({ portfolioId, holdings = [] }) {
  const deleteHolding = useDeleteHolding(portfolioId)

  if (!holdings.length) {
    return <p className="text-sm text-gray-500 py-4 text-center">No holdings yet</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="pb-2 font-medium">Ticker</th>
            <th className="pb-2 font-medium">Shares</th>
            <th className="pb-2 font-medium">Cost Basis</th>
            <th className="pb-2 font-medium">Type</th>
            <th className="pb-2 font-medium">Added</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 font-medium text-gray-900">{h.ticker}</td>
              <td className="py-2">{h.shares}</td>
              <td className="py-2">{h.cost_basis ? `$${h.cost_basis.toFixed(2)}` : '-'}</td>
              <td className="py-2 capitalize">{h.asset_type}</td>
              <td className="py-2 text-gray-500">{new Date(h.added_at).toLocaleDateString()}</td>
              <td className="py-2">
                <button
                  onClick={() => deleteHolding.mutate(h.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
