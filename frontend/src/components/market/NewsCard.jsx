import { ExternalLink } from 'lucide-react'

export default function NewsCard({ article }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 line-clamp-2">{article.title}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs text-blue-600 font-medium">{article.source}</span>
            <span className="text-xs text-gray-400">
              {article.published_at ? new Date(article.published_at).toLocaleDateString() : ''}
            </span>
          </div>
        </div>
        {article.url && (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-blue-500 flex-shrink-0"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  )
}
