import type { EChartsOption, SeriesOption } from 'echarts'

export const chartColors = {
  lime: '#C6F24E',
  green: '#4ADE80',
  red: '#FB7185',
  amber: '#FBBF24',
  olive: '#5B6B4F',
  steel: '#8B9DA8',
  total: '#E5E7EB',
  grid: 'rgba(255,255,255,0.05)',
  axis: '#6B7280',
  tooltipBg: '#1F1F1F',
  tooltipBorder: 'rgba(255,255,255,0.1)',
  text: '#F5F5F5',
} as const

export const chartPalette = [chartColors.lime, chartColors.olive, chartColors.steel, chartColors.total]

const axisBase = {
  axisLine: {show: false},
  axisTick: {show: false},
  axisLabel: {color: chartColors.axis, fontSize: 11, fontFamily: 'Inter Variable, Inter, sans-serif'},
} as const

export function baseOption(): EChartsOption {
  return {
    color: chartPalette as unknown as string[],
    textStyle: {fontFamily: 'Inter Variable, Inter, sans-serif', color: chartColors.text},
    grid: {left: 8, right: 12, top: 24, bottom: 4, containLabel: true},
    tooltip: {
      trigger: 'axis',
      backgroundColor: chartColors.tooltipBg,
      borderColor: chartColors.tooltipBorder,
      borderWidth: 1,
      padding: [10, 14],
      textStyle: {color: chartColors.text, fontSize: 12},
      axisPointer: {lineStyle: {color: 'rgba(198,242,78,0.35)'}},
    },
    legend: {
      textStyle: {color: chartColors.axis, fontSize: 11},
      itemWidth: 10,
      itemHeight: 10,
      icon: 'circle',
    },
    xAxis: {type: 'category', ...axisBase},
    yAxis: {
      type: 'value',
      ...axisBase,
      splitLine: {lineStyle: {color: chartColors.grid, type: 'dashed'}},
    },
    animationDuration: 600,
    animationEasing: 'cubicOut',
  }
}

export function limeAreaSeries(name: string, data: number[], extra?: Partial<SeriesOption>): SeriesOption {
  return {
    name,
    type: 'line',
    smooth: true,
    symbol: 'circle',
    symbolSize: 7,
    showSymbol: false,
    data,
    lineStyle: {width: 2.5, color: chartColors.lime},
    itemStyle: {color: chartColors.lime, borderColor: '#0C0C0C', borderWidth: 2},
    emphasis: {scale: 1.4},
    areaStyle: {
      color: {
        type: 'linear',
        x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          {offset: 0, color: 'rgba(198,242,78,0.25)'},
          {offset: 1, color: 'rgba(198,242,78,0)'},
        ],
      },
    },
    ...extra,
  } as SeriesOption
}

export function roundedBarSeries(name: string, data: (number | null)[], color: string = chartColors.lime, extra?: Partial<SeriesOption>): SeriesOption {
  return {
    name,
    type: 'bar',
    data,
    barMaxWidth: 26,
    itemStyle: {color, borderRadius: [999, 999, 0, 0]},
    ...extra,
  } as SeriesOption
}
