import { useState } from 'react'
import { usePortfolios, usePortfolio, useCreatePortfolio, useDeletePortfolio } from '../hooks/usePortfolios'
import { usePortfolioContext } from '../context/PortfolioContext'
import FileUpload from '../components/portfolio/FileUpload'
import ManualEntryForm from '../components/portfolio/ManualEntryForm'
import HoldingsTable from '../components/portfolio/HoldingsTable'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorBanner from '../components/common/ErrorBanner'
import { Plus, Trash2, Upload, PenLine, User, Shield, Scale, Rocket } from 'lucide-react'

const CATEGORY_BADGES = {
  conservative: { label: 'Conservative', class: 'bg-blue-100 text-blue-700', icon: Shield },
  balanced: { label: 'Balanced', class: 'bg-gray-100 text-gray-700', icon: Scale },
  'high-growth': { label: 'High Growth', class: 'bg-purple-100 text-purple-700', icon: Rocket },
}

export default function PortfolioManager() {
  const { selectedPortfolioId, setSelectedPortfolioId } = usePortfolioContext()
  const { data: portfolios = [], isLoading, error } = usePortfolios()
  const { data: portfolio } = usePortfolio(selectedPortfolioId)
  const createPortfolio = useCreatePortfolio()
  const deletePortfolio = useDeletePortfolio()

  const [showUpload, setShowUpload] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [clientName, setClientName] = useState('')
  const [category, setCategory] = useState('balanced')
  const [benchmark, setBenchmark] = useState('SPY')
  const [riskTolerance, setRiskTolerance] = useState('moderate')
  const [cashBalance, setCashBalance] = useState('')

  const handleCreate = (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    createPortfolio.mutate(
      {
        name: newName.trim(),
        client_name: clientName.trim() || null,
        category,
        benchmark: benchmark || 'SPY',
        risk_tolerance: riskTolerance,
        cash_balance: parseFloat(cashBalance) || 0,
      },
      {
        onSuccess: (p) => {
          setSelectedPortfolioId(p.id)
          setShowCreate(false)
          setNewName('')
          setClientName('')
          setCategory('balanced')
          setBenchmark('SPY')
          setRiskTolerance('moderate')
          setCashBalance('')
        },
      }
    )
  }

  const handleDelete = (id) => {
    if (!confirm('Delete this portfolio and all its holdings?')) return
    deletePortfolio.mutate(id, {
      onSuccess: () => {
        if (selectedPortfolioId === id) setSelectedPortfolioId(null)
      },
    })
  }

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorBanner message="Failed to load portfolios" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Portfolios</h2>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowCreate(true); setShowUpload(false) }}
            className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={16} /> New Portfolio
          </button>
          <button
            onClick={() => { setShowUpload(true); setShowCreate(false) }}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-gray-200"
          >
            <Upload size={16} /> Upload CSV
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="font-medium text-gray-900 mb-3">Create New Portfolio</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Client Name</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="John Smith"
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Portfolio Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Growth Portfolio"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                >
                  <option value="conservative">Conservative</option>
                  <option value="balanced">Balanced</option>
                  <option value="high-growth">High Growth</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Benchmark</label>
                <select
                  value={benchmark}
                  onChange={(e) => setBenchmark(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                >
                  <option value="SPY">S&P 500 (SPY)</option>
                  <option value="QQQ">NASDAQ 100 (QQQ)</option>
                  <option value="DIA">Dow Jones (DIA)</option>
                  <option value="IWM">Russell 2000 (IWM)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Risk Tolerance</label>
                <select
                  value={riskTolerance}
                  onChange={(e) => setRiskTolerance(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                >
                  <option value="conservative">Conservative</option>
                  <option value="moderate">Moderate</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cash Balance ($)</label>
                <input
                  type="number"
                  value={cashBalance}
                  onChange={(e) => setCashBalance(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={createPortfolio.isPending}
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Create Portfolio
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Upload form */}
      {showUpload && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-medium text-gray-900 mb-4">Upload Portfolio from File</h3>
          <FileUpload onSuccess={() => setShowUpload(false)} />
        </div>
      )}

      {/* Portfolio list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {portfolios.map((p) => {
          const catBadge = CATEGORY_BADGES[p.category] || CATEGORY_BADGES.balanced
          const CatIcon = catBadge.icon

          return (
            <div
              key={p.id}
              onClick={() => setSelectedPortfolioId(p.id)}
              className={`bg-white rounded-lg border p-4 cursor-pointer transition-all ${
                selectedPortfolioId === p.id
                  ? 'border-blue-500 ring-2 ring-blue-100'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{p.name}</p>
                  {p.client_name && (
                    <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
                      <User size={10} className="text-gray-400" />
                      {p.client_name}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-gray-500">{p.holdings_count} holdings</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 ${catBadge.class}`}>
                      <CatIcon size={9} />
                      {catBadge.label}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(p.id)
                  }}
                  className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {p.description && (
                <p className="text-xs text-gray-500 mt-2 line-clamp-2">{p.description}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Selected portfolio details */}
      {portfolio && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          <div className="flex items-center gap-2">
            <PenLine size={16} className="text-gray-400" />
            <h3 className="font-medium text-gray-900">Add Holding to {portfolio.name}</h3>
          </div>
          <ManualEntryForm portfolioId={portfolio.id} />
          <hr className="border-gray-200" />
          <HoldingsTable portfolioId={portfolio.id} holdings={portfolio.holdings} />
        </div>
      )}
    </div>
  )
}
