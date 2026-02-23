import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileSpreadsheet } from 'lucide-react'
import { useUploadPortfolio } from '../../hooks/usePortfolios'

export default function FileUpload({ onSuccess }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const upload = useUploadPortfolio()

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    onDrop: (files) => setFile(files[0]),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim() || !file) return
    upload.mutate(
      { name: name.trim(), description: description.trim() || null, file },
      {
        onSuccess: () => {
          setName('')
          setDescription('')
          setFile(null)
          onSuccess?.()
        },
      }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Portfolio Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Client: John Smith"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Notes about this portfolio"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        {file ? (
          <div className="flex items-center justify-center gap-2 text-green-700">
            <FileSpreadsheet size={20} />
            <span className="text-sm font-medium">{file.name}</span>
          </div>
        ) : (
          <>
            <Upload className="mx-auto text-gray-400 mb-2" size={32} />
            <p className="text-sm text-gray-500">
              Drag & drop a CSV or Excel file, or click to browse
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Columns: ticker/symbol, shares/quantity, cost_basis (optional)
            </p>
          </>
        )}
      </div>
      {upload.isError && (
        <p className="text-sm text-red-600">{upload.error?.response?.data?.detail || 'Upload failed'}</p>
      )}
      <button
        type="submit"
        disabled={!name.trim() || !file || upload.isPending}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {upload.isPending ? 'Uploading...' : 'Upload Portfolio'}
      </button>
    </form>
  )
}
