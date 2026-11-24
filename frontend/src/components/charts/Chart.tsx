import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import { baseOption } from './chartTheme'

function mergeOption(option: EChartsOption): EChartsOption {
  const base = baseOption()
  const series = (Array.isArray(option.series) ? option.series : [option.series]).filter(Boolean) as {type?: string}[]
  const cartesian = series.some(item => item.type === 'line' || item.type === 'bar' || item.type === 'scatter')
  const merged: EChartsOption = {...base, ...option}
  if (cartesian) {
    merged.xAxis = {...(base.xAxis as object), ...(option.xAxis as object)} as EChartsOption['xAxis']
    merged.yAxis = {...(base.yAxis as object), ...(option.yAxis as object)} as EChartsOption['yAxis']
  } else {
    delete merged.xAxis
    delete merged.yAxis
    delete merged.grid
  }
  return merged
}

export function Chart({option, height = 280, className}: {option: EChartsOption; height?: number; className?: string}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!rootRef.current) return
    const chart = echarts.init(rootRef.current)
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(rootRef.current)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(mergeOption(option), true)
  }, [option])

  return <div ref={rootRef} style={{height, width: '100%'}} className={className} />
}
