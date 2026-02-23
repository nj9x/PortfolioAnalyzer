import { Loader2 } from 'lucide-react'

export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="animate-spin text-blue-500 mr-3" size={24} />
      <span className="text-gray-500 text-sm">{message}</span>
    </div>
  )
}
