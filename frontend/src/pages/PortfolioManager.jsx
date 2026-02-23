import { useState } from 'react'
import { usePortfolios, usePortfolio, useCreatePortfolio, useDeletePortfolio } from '../hooks/usePortfolios'
import { usePortfolioContext } from '../context/PortfolioContext'
import FileUpload from '../components/portfolio/FileUpload'
import ManualEntryForm from '../components/portfolio/ManualEntryForm'
import HoldingsTable from '../components/portfolio/HoldingsTable'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorBanner from '../components/common/ErrorBanner'
import { Plus, Trash2, Upload, PenLine } from 'lucide-react'

export default function PortfolioManager() {
  const { selectedPortfolioId, setSelectedPortfolioId } = usePortfolioContext()
  const { data: portfolios = [], isLoading, error } = usePortfolios()
  const { data: portfolio } = usePortfolio(selectedPortfolioId)
  const createPortfolio = useCreatePortfolio()
  const deletePortfolio = useDeletePortfolio()

  const [showUpload, setShowUpload] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const handleCreate = (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    createPortfolio.mutate(
      { name: newName.trim() },
      {
        onSuccess: (p) => {
          setSelectedPortfolioId(p.id)
          setShowCreate(false)
          setNewName('')
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
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <form onSubmit={handleCreate} className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Portfolio name"
              className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              autoFocus
            />
            <button
              type="submit"
              disabled={createPortfolio.isPending}
              className="bg-blue-600 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Cancel
            </button>
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
        {portfolios.map((p) => (
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
              <div>
                <p className="font-medium text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {p.holdings_count} holdings
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(p.id)
                }}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
            {p.description && (
              <p className="text-xs text-gray-500 mt-2 line-clamp-2">{p.description}</p>
            )}
          </div>
        ))}
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
