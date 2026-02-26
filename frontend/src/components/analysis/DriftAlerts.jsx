import { AlertTriangle, CheckCircle } from 'lucide-react'
import clsx from 'clsx'

const SEVERITY_STYLES = {
  high: 'border-red-200 bg-red-50 text-red-700',
  medium: 'border-orange-200 bg-orange-50 text-orange-700',
  low: 'border-yellow-200 bg-yellow-50 text-yellow-700',
}

export default function DriftAlerts({ drift }) {
  if (!drift?.has_target) return null

  const { current, target, drifts } = drift
  const allTypes = [...new Set([...Object.keys(target), ...Object.keys(current)])]
  const hasDrifts = drifts.length > 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Allocation Drift
        </h3>
        {hasDrifts ? (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
            {drifts.length} drift{drifts.length > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
            <CheckCircle size={10} />
            On target
          </span>
        )}
      </div>

      {/* Allocation comparison bars */}
      <div className="space-y-3">
        {allTypes.map((type) => {
          const cur = current[type] || 0
          const tgt = target[type] || 0
          const driftItem = drifts.find(d => d.asset_type === type)
          const label = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

          return (
            <div key={type}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700">{label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-gray-400">
                    Target: <span className="font-semibold text-gray-600">{tgt.toFixed(0)}%</span>
                  </span>
                  <span className="text-[11px] text-gray-400">
                    Current: <span className={clsx('font-semibold', driftItem ? 'text-orange-600' : 'text-gray-600')}>
                      {cur.toFixed(1)}%
                    </span>
                  </span>
                </div>
              </div>

              {/* Dual progress bar */}
              <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
                {/* Target marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-gray-400 z-10"
                  style={{ left: `${Math.min(tgt, 100)}%` }}
                />
                {/* Current fill */}
                <div
                  className={clsx('h-full rounded-full transition-all', driftItem ? 'bg-orange-400' : 'bg-blue-500')}
                  style={{ width: `${Math.min(cur, 100)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Drift alerts */}
      {hasDrifts && (
        <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
          {drifts.map((d) => (
            <div
              key={d.asset_type}
              className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg border text-xs', SEVERITY_STYLES[d.severity])}
            >
              <AlertTriangle size={13} />
              <span className="font-medium">{d.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
