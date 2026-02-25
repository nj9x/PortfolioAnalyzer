import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { PortfolioProvider } from './context/PortfolioContext'
import MainLayout from './components/layout/MainLayout'
import Dashboard from './pages/Dashboard'
import PortfolioManager from './pages/PortfolioManager'
import MarketSignals from './pages/MarketSignals'
import AnalysisView from './pages/AnalysisView'
import ChartAnalysis from './pages/ChartAnalysis'
import DCFCalculator from './pages/DCFCalculator'
import StockDetail from './pages/StockDetail'
import SECFilings from './pages/SECFilings'

export default function App() {
  return (
    <BrowserRouter>
      <PortfolioProvider>
        <MainLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/portfolios" element={<PortfolioManager />} />
            <Route path="/signals" element={<MarketSignals />} />
            <Route path="/analysis" element={<AnalysisView />} />
            <Route path="/chart-analysis" element={<ChartAnalysis />} />
            <Route path="/dcf" element={<DCFCalculator />} />
            <Route path="/sec-filings" element={<SECFilings />} />
            <Route path="/stock/:ticker" element={<StockDetail />} />
          </Routes>
        </MainLayout>
      </PortfolioProvider>
    </BrowserRouter>
  )
}
