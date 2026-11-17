function units(value: string) {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}
export function budgetProgress(
  amount: string,
  spent: string,
  committed: string,
) {
  const limit = units(amount),
    used = units(spent),
    planned = units(committed)
  const percent = Number((planned * 10000n) / limit) / 100
  const status =
    used > limit
      ? 'Dépassé'
      : planned > limit
        ? 'Dépassement prévu'
        : planned === limit
          ? 'Objectif atteint'
          : planned * 100n >= limit * 80n
            ? 'À surveiller'
            : 'Dans le budget'
  const color =
    planned >= limit
      ? 'rose'
      : planned * 100n >= limit * 80n
        ? 'amber'
        : 'emerald'
  return { percent, width: Math.min(100, percent), status, color }
}

export function validBudgetAmount(value: string) {
  return /^\d{1,17}([.,]\d{1,2})?$/.test(value) && /[1-9]/.test(value)
}
