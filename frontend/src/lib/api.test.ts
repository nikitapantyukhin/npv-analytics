import { describe, expect, it } from 'vitest'
import { formatCount, formatMoney, formatPercentFromDecimal } from './api'

describe('Russian financial formatting', () => {
  it('formats counts and signed money', () => {
    expect(formatCount(10000)).toContain('10')
    expect(formatMoney('-1250')).toContain('−')
  })
  it('converts decimal rates to percent', () => {
    expect(formatPercentFromDecimal('0.165')).toBe('16,5%')
  })
})
