const API_BASE = import.meta.env.VITE_API_URL || '/api'

export class ApiError extends Error {
  constructor(public status: number, public payload: {code?: string; message?: string; details?: unknown}) {
    super(payload.message || `HTTP ${status}`)
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_BASE}${path}`, {...init, headers})
  if (!response.ok) {
    let payload: {code?: string; message?: string; details?: unknown} = {message: response.statusText}
    try { payload = await response.json() } catch { /* keep status text */ }
    throw new ApiError(response.status, payload)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const formatMoney = (value?: string | number | null) => value == null ? '—' : new Intl.NumberFormat('ru-RU', {style: 'currency', currency: 'RUB', maximumFractionDigits: 2}).format(Number(value)).replace(/^-/, '−')
export const formatCount = (value?: number | null) => value == null ? '—' : new Intl.NumberFormat('ru-RU').format(value)
export const formatPercentFromDecimal = (value?: string | number | null) => value == null ? '—' : `${new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 2}).format(Number(value) * 100)}%`
export const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('ru-RU').format(new Date(`${value}T00:00:00`)) : '—'
