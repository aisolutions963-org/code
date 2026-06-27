export function calcCommission(revenue: number): {
  tier: 'none' | 'silver' | 'gold'
  rate: number
  amount: number
  nextThreshold: number | null
  toNext: number | null
} {
  if (revenue >= 600_000) {
    return { tier: 'gold', rate: 0.02, amount: revenue * 0.02, nextThreshold: null, toNext: null }
  }
  if (revenue >= 300_000) {
    return { tier: 'silver', rate: 0.015, amount: revenue * 0.015, nextThreshold: 600_000, toNext: 600_000 - revenue }
  }
  return { tier: 'none', rate: 0, amount: 0, nextThreshold: 300_000, toNext: 300_000 - revenue }
}
