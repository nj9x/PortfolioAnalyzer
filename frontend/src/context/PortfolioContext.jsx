import { createContext, useContext, useState } from 'react'

const PortfolioContext = createContext(null)

export function PortfolioProvider({ children }) {
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(null)

  return (
    <PortfolioContext.Provider value={{ selectedPortfolioId, setSelectedPortfolioId }}>
      {children}
    </PortfolioContext.Provider>
  )
}

export function usePortfolioContext() {
  const ctx = useContext(PortfolioContext)
  if (!ctx) throw new Error('usePortfolioContext must be used within PortfolioProvider')
  return ctx
}
