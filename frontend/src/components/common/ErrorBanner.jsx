import { AlertTriangle } from 'lucide-react'

export default function ErrorBanner({ message }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
      <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
      <p className="text-sm text-red-700">{message}</p>
    </div>
  )
}
