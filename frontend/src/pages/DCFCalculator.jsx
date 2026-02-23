import { useState } from 'react'
import { fetchDCFFinancials } from '../api/dcf'
import { useRunDCF, useDCFHistory, useDCFValuation } from '../hooks/useDCF'
import ValuationSummaryCard from '../components/dcf/ValuationSummaryCard'
import ProjectedFCFChart from '../components/dcf/ProjectedFCFChart'
import SensitivityTable from '../components/dcf/SensitivityTable'
import {
  Calculator, Search, Play, ChevronDown, ChevronUp, Clock,
  TrendingUp, TrendingDown, Minus, AlertTriangle, DollarSign,
  BarChart3, Settings2, Building2, Loader2, Trash2, CheckCircle2
} from 'lucide-react'
import clsx from 'clsx'

const verdictColors = {
  UNDERVALUED: 'text-emerald-400',
  OVERVALUED: 'text-red-400',
  FAIR_VALUE: 'text-amber-400',
}

function fmtB(val) {
  if (val == null) return ''
  if (Math.abs(val) >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(2)}B`
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`
  return `$${val.toLocaleString()}`
}

function DarkInput({ label, value, onChange, suffix = '', type = 'number', step, min, max, hint, icon: Icon }) {
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 uppercase tracking-wider">
          {Icon && <Icon size={12} className="text-slate-500" />}
          {label}
        </label>
        {value !== '' && value !== 0 && value != null && (
          <CheckCircle2 size={12} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={e => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
          step={step}
          min={min}
          max={max}
          className="w-full text-sm text-slate-200 bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-2
            focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50
            placeholder-slate-600 transition-all hover:border-slate-600"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-medium">{suffix}</span>
        )}
      </div>
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

function SectionCard({ title, icon: Icon, children, className = '', collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={clsx('bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800/60 overflow-hidden', className)}>
      <button
        onClick={collapsible ? () => setOpen(!open) : undefined}
        className={clsx(
          'w-full flex items-center justify-between px-5 py-3.5',
          collapsible ? 'cursor-pointer hover:bg-slate-800/30 transition-colors' : 'cursor-default'
        )}
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          {Icon && <Icon size={15} className="text-blue-400" />}
          {title}
        </h3>
        {collapsible && (
          <span className="text-slate-500">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        )}
      </button>
      {(!collapsible || open) && (
        <div className="px-5 pb-5 space-y-3">
          {children}
        </div>
      )}
    </div>
  )
}

export default function DCFCalculator() {
  // Ticker fetch
  const [ticker, setTicker] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [fetchedData, setFetchedData] = useState(null)

  // DCF inputs
  const [companyName, setCompanyName] = useState('')
  const [baseFcf, setBaseFcf] = useState(0)
  const [projectionYears, setProjectionYears] = useState(5)
  const [growthPhase1, setGrowthPhase1] = useState(10)
  const [terminalGrowth, setTerminalGrowth] = useState(3)
  const [terminalMethod, setTerminalMethod] = useState('gordon')
  const [terminalMultiple, setTerminalMultiple] = useState(12)
  const [latestEbitda, setLatestEbitda] = useState(0)

  // WACC inputs
  const [riskFreeRate, setRiskFreeRate] = useState(4.2)
  const [erp, setErp] = useState(5.5)
  const [beta, setBeta] = useState(1.0)
  const [costOfDebt, setCostOfDebt] = useState(5.0)
  const [taxRate, setTaxRate] = useState(21)
  const [debtWeight, setDebtWeight] = useState(0)
  const [discountOverride, setDiscountOverride] = useState('')

  // Balance sheet
  const [totalDebt, setTotalDebt] = useState(0)
  const [totalCash, setTotalCash] = useState(0)
  const [sharesOutstanding, setSharesOutstanding] = useState(1)
  const [currentPrice, setCurrentPrice] = useState(0)

  // Results
  const runDcf = useRunDCF()
  const { data: history = [] } = useDCFHistory()
  const [selectedId, setSelectedId] = useState(null)
  const { data: selectedValuation } = useDCFValuation(selectedId)

  const currentResult = selectedId ? selectedValuation : runDcf.data

  // Computed WACC
  const costOfEquity = (riskFreeRate / 100) + beta * (erp / 100)
  const equityWeight = 1 - debtWeight / 100
  const computedWacc = equityWeight * costOfEquity + (debtWeight / 100) * (costOfDebt / 100) * (1 - taxRate / 100)
  const effectiveDiscount = discountOverride ? parseFloat(discountOverride) / 100 : computedWacc

  const handleFetch = async () => {
    if (!ticker.trim()) return
    setFetching(true)
    setFetchError('')
    try {
      const data = await fetchDCFFinancials(ticker.trim().toUpperCase())
      setFetchedData(data)
      setCompanyName(data.company_name || '')
      setBaseFcf(data.free_cashflow || 0)
      setLatestEbitda(data.ebitda || 0)
      setTotalDebt(data.total_debt || 0)
      setTotalCash(data.total_cash || 0)
      setSharesOutstanding(data.shares_outstanding || 1)
      setCurrentPrice(data.current_price || 0)
      setBeta(data.beta || 1.0)
      if (data.wacc_inputs) {
        setRiskFreeRate((data.wacc_inputs.risk_free_rate || 0.042) * 100)
        setErp((data.wacc_inputs.equity_risk_premium || 0.055) * 100)
        setCostOfDebt((data.wacc_inputs.cost_of_debt || 0.05) * 100)
        setTaxRate((data.wacc_inputs.tax_rate || 0.21) * 100)
        setDebtWeight((data.wacc_inputs.debt_weight || 0) * 100)
      }
      if (data.revenue_growth) {
        setGrowthPhase1(Math.round(Math.abs(data.revenue_growth) * 100 * 10) / 10)
      }
      setSelectedId(null)
      runDcf.reset()
    } catch (err) {
      setFetchError(err?.response?.data?.detail || 'Failed to fetch data')
    } finally {
      setFetching(false)
    }
  }

  const handleCalculate = () => {
    setSelectedId(null)
    runDcf.mutate({
      ticker: ticker.trim().toUpperCase() || null,
      company_name: companyName || null,
      base_fcf: baseFcf,
      projection_years: projectionYears,
      growth_rate_phase1: growthPhase1 / 100,
      growth_rate_phase2: terminalGrowth / 100,
      discount_rate: discountOverride ? parseFloat(discountOverride) / 100 : null,
      terminal_method: terminalMethod,
      terminal_multiple: terminalMethod === 'exit_multiple' ? terminalMultiple : null,
      latest_ebitda: latestEbitda || null,
      wacc_inputs: !discountOverride ? {
        risk_free_rate: riskFreeRate / 100,
        equity_risk_premium: erp / 100,
        beta,
        cost_of_debt: costOfDebt / 100,
        tax_rate: taxRate / 100,
        debt_weight: debtWeight / 100,
        equity_weight: equityWeight,
      } : null,
      total_debt: totalDebt,
      total_cash: totalCash,
      shares_outstanding: sharesOutstanding,
      current_price: currentPrice || null,
      save: true,
    })
  }

  const handleHistoryClick = (id) => {
    setSelectedId(id)
    runDcf.reset()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 -m-6 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <Calculator size={18} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">DCF Valuation Calculator</h1>
            <p className="text-xs text-slate-500">Discounted Cash Flow Analysis</p>
          </div>
        </div>

        {/* Ticker Search Bar */}
        <div className="mt-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleFetch()}
              placeholder="Enter ticker symbol (e.g. AAPL, MSFT)"
              className="w-full text-sm text-slate-200 bg-slate-800/60 border border-slate-700/50 rounded-lg pl-9 pr-4 py-2.5
                focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50
                placeholder-slate-600 transition-all"
            />
          </div>
          <button
            onClick={handleFetch}
            disabled={fetching || !ticker.trim()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium
              disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-600/20"
          >
            {fetching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Fetch Data
          </button>
          {fetchError && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle size={12} /> {fetchError}
            </p>
          )}
        </div>

        {/* Company Header - shows after fetch */}
        {fetchedData && companyName && (
          <div className="mt-4 bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <Building2 size={20} className="text-slate-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{companyName}</h2>
                  <p className="text-xs text-slate-500">{ticker.toUpperCase()}</p>
                </div>
              </div>
              {currentPrice > 0 && (
                <div className="text-right">
                  <p className="text-2xl font-bold text-white">${currentPrice.toFixed(2)}</p>
                  <p className="text-xs text-slate-500">Current Price</p>
                </div>
              )}
            </div>

            {/* Key Metrics Bar */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {[
                { label: 'Free Cash Flow', value: fetchedData.free_cashflow ? fmtB(fetchedData.free_cashflow) : '—' },
                { label: 'EBITDA', value: fetchedData.ebitda ? fmtB(fetchedData.ebitda) : '—' },
                { label: 'Market Cap', value: fetchedData.market_cap ? fmtB(fetchedData.market_cap) : '—' },
                { label: 'Beta', value: fetchedData.beta?.toFixed(2) || '—' },
                { label: 'Revenue Growth', value: fetchedData.revenue_growth ? `${(fetchedData.revenue_growth * 100).toFixed(1)}%` : '—' },
                { label: 'Profit Margin', value: fetchedData.profit_margins ? `${(fetchedData.profit_margins * 100).toFixed(1)}%` : '—' },
              ].map((m, i) => (
                <div key={i} className="bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-700/30">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">{m.label}</p>
                  <p className="text-sm font-semibold text-slate-200 mt-0.5">{m.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT COLUMN: Inputs */}
        <div className="space-y-4">
          {/* DCF Assumptions */}
          <SectionCard title="DCF Assumptions" icon={BarChart3}>
            <DarkInput
              label="Base Free Cash Flow"
              value={baseFcf}
              onChange={setBaseFcf}
              icon={DollarSign}
              hint={baseFcf ? `${fmtB(baseFcf)}` : 'TTM Free Cash Flow used as baseline'}
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Projection Period
                </label>
                <span className="text-sm font-semibold text-blue-400">{projectionYears} years</span>
              </div>
              <input
                type="range" min={3} max={10} value={projectionYears}
                onChange={e => setProjectionYears(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500
                  [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-blue-500/30"
              />
              <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                <span>3yr</span><span>10yr</span>
              </div>
            </div>

            <DarkInput
              label="Phase 1 Growth Rate"
              value={growthPhase1}
              onChange={setGrowthPhase1}
              suffix="%"
              step={0.5}
              icon={TrendingUp}
              hint="Annual FCF growth during projection period"
            />
            <DarkInput
              label="Terminal Growth Rate"
              value={terminalGrowth}
              onChange={setTerminalGrowth}
              suffix="%"
              step={0.1}
              hint="Perpetual growth rate (typically 2-3%)"
            />

            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                Terminal Value Method
              </label>
              <select
                value={terminalMethod}
                onChange={e => setTerminalMethod(e.target.value)}
                className="w-full text-sm text-slate-200 bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              >
                <option value="gordon">Gordon Growth Model</option>
                <option value="exit_multiple">Exit Multiple (EV/EBITDA)</option>
              </select>
            </div>

            {terminalMethod === 'exit_multiple' && (
              <>
                <DarkInput label="Exit Multiple" value={terminalMultiple} onChange={setTerminalMultiple} suffix="x" step={0.5} />
                <DarkInput label="EBITDA" value={latestEbitda} onChange={setLatestEbitda} icon={DollarSign} hint={latestEbitda ? fmtB(latestEbitda) : ''} />
              </>
            )}
          </SectionCard>

          {/* WACC / Discount Rate */}
          <SectionCard title="WACC / Discount Rate" icon={Settings2} collapsible defaultOpen={false}>
            <div className="flex items-center justify-between py-1 px-3 bg-slate-800/40 rounded-lg border border-slate-700/30 mb-2">
              <span className="text-xs text-slate-400">Effective Rate</span>
              <span className="text-sm font-bold text-blue-400">
                {discountOverride ? `${discountOverride}%` : `${(computedWacc * 100).toFixed(2)}%`}
                <span className="text-[10px] text-slate-500 ml-1">
                  {discountOverride ? '(manual)' : '(WACC)'}
                </span>
              </span>
            </div>

            <DarkInput
              label="Discount Rate Override"
              value={discountOverride}
              onChange={setDiscountOverride}
              suffix="%"
              type="text"
              hint="Leave empty to use computed WACC"
            />

            <div className="border-t border-slate-800/60 pt-3 mt-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">WACC Components</p>
              <div className="grid grid-cols-2 gap-2.5">
                <DarkInput label="Risk-Free Rate" value={riskFreeRate} onChange={setRiskFreeRate} suffix="%" step={0.1} />
                <DarkInput label="Equity Risk Premium" value={erp} onChange={setErp} suffix="%" step={0.1} />
                <DarkInput label="Beta" value={beta} onChange={setBeta} step={0.1} />
                <DarkInput label="Cost of Debt" value={costOfDebt} onChange={setCostOfDebt} suffix="%" step={0.1} />
                <DarkInput label="Tax Rate" value={taxRate} onChange={setTaxRate} suffix="%" step={1} />
                <DarkInput label="Debt Weight" value={debtWeight} onChange={setDebtWeight} suffix="%" step={1} />
              </div>
            </div>
          </SectionCard>

          {/* Balance Sheet */}
          <SectionCard title="Balance Sheet" icon={Building2} collapsible>
            <DarkInput label="Total Debt" value={totalDebt} onChange={setTotalDebt} icon={DollarSign} hint={totalDebt ? fmtB(totalDebt) : ''} />
            <DarkInput label="Cash & Equivalents" value={totalCash} onChange={setTotalCash} icon={DollarSign} hint={totalCash ? fmtB(totalCash) : ''} />
            <DarkInput label="Shares Outstanding" value={sharesOutstanding} onChange={setSharesOutstanding} hint={sharesOutstanding ? fmtB(sharesOutstanding) : ''} />
            <DarkInput label="Current Share Price" value={currentPrice} onChange={setCurrentPrice} icon={DollarSign} />
          </SectionCard>

          {/* Calculate Button */}
          <button
            onClick={handleCalculate}
            disabled={runDcf.isPending || baseFcf === 0}
            className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 to-blue-500
              hover:from-blue-500 hover:to-blue-400 text-white px-4 py-3 rounded-xl text-sm font-semibold
              disabled:opacity-40 disabled:cursor-not-allowed transition-all
              shadow-lg shadow-blue-600/25 hover:shadow-blue-500/30"
          >
            {runDcf.isPending ? (
              <><Loader2 size={16} className="animate-spin" /> Calculating...</>
            ) : (
              <><Play size={16} /> Run DCF Valuation</>
            )}
          </button>

          {runDcf.isError && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-3 text-xs text-red-400 flex items-center gap-2">
              <AlertTriangle size={14} />
              {runDcf.error?.response?.data?.detail || 'Calculation failed'}
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <SectionCard title="History" icon={Clock}>
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin">
                {history.map(h => (
                  <button
                    key={h.id}
                    onClick={() => handleHistoryClick(h.id)}
                    className={clsx(
                      'w-full text-left p-3 rounded-lg border transition-all',
                      selectedId === h.id
                        ? 'border-blue-500/40 bg-blue-600/10'
                        : 'border-slate-800/40 bg-slate-800/20 hover:bg-slate-800/40 hover:border-slate-700/50'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-200">{h.ticker || 'Manual'}</span>
                      {h.valuation_verdict && (
                        <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold border',
                          h.valuation_verdict === 'UNDERVALUED' && 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                          h.valuation_verdict === 'OVERVALUED' && 'text-red-400 bg-red-500/10 border-red-500/20',
                          h.valuation_verdict === 'FAIR_VALUE' && 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                        )}>
                          {h.valuation_verdict.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      {h.intrinsic_value_per_share != null && <span>IV: ${h.intrinsic_value_per_share.toFixed(2)}</span>}
                      {h.upside_downside_pct != null && (
                        <span className={h.upside_downside_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {h.upside_downside_pct >= 0 ? '+' : ''}{h.upside_downside_pct}%
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 mt-1">{new Date(h.created_at).toLocaleString()}</p>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* RIGHT COLUMN: Results */}
        <div className="lg:col-span-2 space-y-4">
          {runDcf.isPending && (
            <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-12 text-center">
              <Loader2 size={32} className="animate-spin text-blue-500 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Running DCF calculation...</p>
            </div>
          )}

          {currentResult && !runDcf.isPending && (
            <>
              <ValuationSummaryCard result={currentResult} />
              <ProjectedFCFChart projections={currentResult.projected_fcfs} />
              <SensitivityTable
                table={currentResult.sensitivity_table}
                currentPrice={currentResult.current_price}
                activeWacc={currentResult.discount_rate}
                activeGrowth={currentResult.growth_rate_phase2}
              />

              <div className="bg-amber-900/10 border border-amber-700/20 rounded-xl p-4">
                <p className="text-xs text-amber-500/80 flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  This DCF model is for educational and analytical purposes only, not financial advice.
                  Intrinsic value estimates depend heavily on assumptions. Always conduct thorough
                  due diligence before making investment decisions.
                </p>
              </div>
            </>
          )}

          {!currentResult && !runDcf.isPending && (
            <div className="bg-slate-900/30 border border-slate-800/40 rounded-xl p-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center mx-auto mb-4">
                <Calculator size={28} className="text-slate-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-300 mb-2">Run a DCF Valuation</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Enter a ticker to auto-fetch financials, adjust your assumptions, and calculate
                intrinsic value with full sensitivity analysis.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
