import { useState } from 'react'
import { useAddHolding } from '../../hooks/usePortfolios'
import { Plus } from 'lucide-react'

export default function ManualEntryForm({ portfolioId }) {
  const [ticker, setTicker] = useState('')
  const [shares, setShares] = useState('')
  const [costBasis, setCostBasis] = useState('')
  const [assetType, setAssetType] = useState('equity')
  const addHolding = useAddHolding(portfolioId)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!ticker.trim() || !shares) return
    addHolding.mutate(
      {
        ticker: ticker.trim().toUpperCase(),
        shares: parseFloat(shares),
        cost_basis: costBasis ? parseFloat(costBasis) : null,
        asset_type: assetType,
      },
      {
        onSuccess: () => {
          setTicker('')
          setShares('')
          setCostBasis('')
        },
      }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-500 mb-1">Ticker</label>
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="AAPL"
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
          required
        />
      </div>
      <div className="w-24">
        <label className="block text-xs font-medium text-gray-500 mb-1">Shares</label>
        <input
          type="number"
          step="any"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          placeholder="100"
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
          required
        />
      </div>
      <div className="w-28">
        <label className="block text-xs font-medium text-gray-500 mb-1">Cost Basis</label>
        <input
          type="number"
          step="0.01"
          value={costBasis}
          onChange={(e) => setCostBasis(e.target.value)}
          placeholder="150.00"
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        />
      </div>
      <div className="w-28">
        <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
        <select
          value={assetType}
          onChange={(e) => setAssetType(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        >
          <option value="equity">Equity</option>
          <option value="etf">ETF</option>
          <option value="crypto">Crypto</option>
          <option value="bond">Bond</option>
          <option value="other">Other</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={addHolding.isPending}
        className="bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        <Plus size={18} />
      </button>
    </form>
  )
}
