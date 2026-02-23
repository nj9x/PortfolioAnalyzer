import clsx from 'clsx'

function getCellStyle(intrinsicValue, currentPrice) {
  if (!currentPrice || currentPrice <= 0) return 'text-slate-300'
  const ratio = intrinsicValue / currentPrice
  if (ratio > 1.3) return 'text-emerald-400 bg-emerald-500/10'
  if (ratio > 1.1) return 'text-emerald-300 bg-emerald-500/5'
  if (ratio > 0.9) return 'text-amber-300 bg-amber-500/5'
  if (ratio > 0.7) return 'text-red-300 bg-red-500/5'
  return 'text-red-400 bg-red-500/10'
}

export default function SensitivityTable({ table, currentPrice, activeWacc, activeGrowth }) {
  if (!table?.length) return null

  const growthRates = table[0].map(c => c.terminal_growth)

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800/60 p-5">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-slate-200">Sensitivity Analysis</h4>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Intrinsic value per share across WACC and terminal growth rate scenarios
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                WACC &#92; TGR
              </th>
              {growthRates.map((g, i) => (
                <th
                  key={i}
                  className={clsx(
                    'px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider',
                    Math.abs(g - activeGrowth) < 0.001
                      ? 'text-blue-400 bg-blue-500/5'
                      : 'text-slate-500'
                  )}
                >
                  {(g * 100).toFixed(1)}%
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {table.map((row, ri) => {
              const wacc = row[0].wacc
              const isActiveRow = Math.abs(wacc - activeWacc) < 0.001
              return (
                <tr key={ri} className="transition-colors hover:bg-slate-800/20">
                  <td
                    className={clsx(
                      'px-3 py-2.5 text-xs font-semibold whitespace-nowrap',
                      isActiveRow ? 'text-blue-400 bg-blue-500/5' : 'text-slate-500'
                    )}
                  >
                    {(wacc * 100).toFixed(2)}%
                  </td>
                  {row.map((cell, ci) => {
                    const isActiveCell =
                      isActiveRow && Math.abs(cell.terminal_growth - activeGrowth) < 0.001
                    return (
                      <td
                        key={ci}
                        className={clsx(
                          'px-3 py-2.5 text-center text-sm font-medium whitespace-nowrap transition-colors',
                          getCellStyle(cell.intrinsic_value, currentPrice),
                          isActiveCell && 'ring-1 ring-blue-500/60 ring-inset rounded bg-blue-500/10 !text-blue-300 font-bold'
                        )}
                      >
                        ${cell.intrinsic_value.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {currentPrice && (
        <div className="flex items-center gap-5 mt-4 pt-3 border-t border-slate-800/40 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/30" />
            Above current price
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/15 border border-amber-500/20" />
            Near current price
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500/15 border border-red-500/20" />
            Below current price
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/15 ring-1 ring-blue-500/40" />
            Current assumptions
          </span>
        </div>
      )}
    </div>
  )
}
