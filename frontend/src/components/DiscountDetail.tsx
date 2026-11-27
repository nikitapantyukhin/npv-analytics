import { useQuery } from '@tanstack/react-query'
import { api, formatDate, formatMoney, formatPercentFromDecimal } from '../lib/api'
import { Button, Card, CardHeader, EmptyState } from './ui'

type Price = {rate: string; df: string; pv: string}
export type DiscountBreakdown = {
  pv_before: string; pv_after: string; npv_before: string; npv_after: string; delta: string
  valuation_date: string; total: number; pages: number
  items: {deal_id: string; date: string; amount: string; event_order: number; payment_type: string; before: Price; after: Price}[]
}

export function useDiscountBreakdown(runId: string | undefined, page: number, alternativeId?: string, scenario = 'base', dealId?: string) {
  const params = new URLSearchParams({scenario, page: String(page)})
  if (alternativeId) params.set('alternative_id', alternativeId)
  if (dealId) params.set('deal_id', dealId)
  return useQuery({
    queryKey: ['discount', runId, params.toString()],
    queryFn: () => api<DiscountBreakdown>(`/runs/${runId}/discount?${params}`),
    enabled: !!runId,
  })
}

export function DiscountDetail({data, page, onPage}: {data: DiscountBreakdown; page: number; onPage: (page: number) => void}) {
  const formatFactor = (value: string) => Number(value).toLocaleString('ru-RU', {maximumFractionDigits: 8})
  return (
    <Card>
      <CardHeader title="Дисконтирование по событиям" side={`${data.total} событий`} />
      {data.items.length ? <div className="overflow-auto">
        <table className="w-full border-collapse text-left whitespace-nowrap text-xs">
          <thead><tr>{['Сделка', 'Платёж', 'Сумма', 'Ставка до', 'Ставка после', 'DF до', 'DF после', 'PV до', 'PV после'].map(label =>
            <th key={label} className="border-b border-border p-2">{label}</th>,
          )}</tr></thead>
          <tbody>{data.items.map(item => (
            <tr key={`${item.deal_id}/${item.event_order}`} className="border-b border-border">
              {[
                item.deal_id, `${formatDate(item.date)} · ${item.payment_type}`, formatMoney(item.amount),
                formatPercentFromDecimal(item.before.rate), formatPercentFromDecimal(item.after.rate),
                formatFactor(item.before.df), formatFactor(item.after.df), formatMoney(item.before.pv), formatMoney(item.after.pv),
              ].map((value, index) => <td className="p-2 tnum" key={index}>{value}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div> : <EmptyState compact title="Нет ненулевых платежей" text="Для этого расчёта нет событий, влияющих на PV" />}
      {data.pages > 1 && <div className="flex gap-3 items-center mt-4 text-xs">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Назад</Button>
        Страница {page} из {data.pages}
        <Button variant="secondary" size="sm" disabled={page >= data.pages} onClick={() => onPage(page + 1)}>Вперёд</Button>
      </div>}
    </Card>
  )
}
