import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { OverviewPage } from '../features/OverviewPage'
import { GeneratorPage } from '../features/GeneratorPage'
import { PortfolioPage } from '../features/PortfolioPage'
import { DealPage } from '../features/DealPage'
import { AnalysisPage } from '../features/AnalysisPage'
import { CurvesPage } from '../features/CurvesPage'
import { IntegrationsPage } from '../features/IntegrationsPage'

export function App() {
  return <Routes><Route element={<Layout />}>
    <Route index element={<Navigate to="/overview" replace />} />
    <Route path="/overview" element={<OverviewPage />} />
    <Route path="/generator" element={<GeneratorPage />} />
    <Route path="/portfolios" element={<PortfolioPage />} />
    <Route path="/portfolios/:portfolioId" element={<PortfolioPage />} />
    <Route path="/portfolios/:portfolioId/deals/:dealId" element={<DealPage />} />
    <Route path="/analysis" element={<AnalysisPage />} />
    <Route path="/curves" element={<CurvesPage />} />
    <Route path="/integrations" element={<IntegrationsPage />} />
    <Route path="*" element={<Navigate to="/overview" replace />} />
  </Route></Routes>
}
