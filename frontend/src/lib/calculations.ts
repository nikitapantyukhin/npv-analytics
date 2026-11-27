import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export type Run = {
  run_id: string
  type: string
  status: string
  stage: string
  created_at: string
  portfolio_version_id?: string
  valuation_date?: string
  market_snapshot_id?: string
  method_version?: string
  engine_sha?: string
  inputs?: Record<string, string | null>
  error_summary?: string
  result?: Record<string, unknown>
}

export type SavedValuation = {
  run_id: string
  portfolio_id: string
  portfolio_name: string
  valuation_date: string
  snapshot_id: string
  method_version: string
  pv: string
  balance: string
  npv: string
}

export function useValuations(portfolioId?: string, enabled = true) {
  return useQuery({
    queryKey: ['valuations', portfolioId],
    queryFn: () => api<SavedValuation[]>(`/analysis/valuations${portfolioId ? `?portfolio_id=${encodeURIComponent(portfolioId)}` : ''}`),
    enabled,
  })
}

export type IndicatorDataset = {
  id: string
  filename: string
  source: string
  valuation_date: string | null
  first_date: string
  last_date: string
  scenarios: string[]
  rows: number
  sha256: string
}

export type RunArtifact = {id: string; filename: string; sha256: string}

export function runArtifacts(run?: Run): RunArtifact[] {
  return Array.isArray(run?.result?.artifacts) ? run.result.artifacts as RunArtifact[] : []
}

export function runActive(run?: Run): boolean {
  return run?.status === 'queued' || run?.status === 'running'
}

export function useTrackedRun(initial?: Run) {
  const query = useQuery({
    queryKey: ['run', initial?.run_id],
    queryFn: () => api<Run>(`/runs/${initial!.run_id}`),
    enabled: runActive(initial),
    refetchInterval: query => !query.state.error && runActive(query.state.data ?? initial) ? 1000 : false,
  })
  return {run: query.data ?? initial, error: query.error}
}
