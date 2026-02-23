import { usePortfolioContext } from '../../context/PortfolioContext'
import { usePortfolios } from '../../hooks/usePortfolios'
import { RefreshCw } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { refreshCache } from '../../api/marketData'

export default function Header() {
  const { selectedPortfolioId, setSelectedPortfolioId } = usePortfolioContext()
  const { data: portfolios = [] } = usePortfolios()
  const qc = useQueryClient()

  const refresh = useMutation({
    mutationFn: refreshCache,
    onSuccess: () => qc.invalidateQueries(),
  })

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-500 font-medium">Portfolio:</label>
        <select
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={selectedPortfolioId ?? ''}
          onChange={(e) => setSelectedPortfolioId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Select a portfolio</option>
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={() => refresh.mutate()}
        disabled={refresh.isPending}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
      >
        <RefreshCw size={16} className={refresh.isPending ? 'animate-spin' : ''} />
        Refresh Data
      </button>
    </header>
  )
}
