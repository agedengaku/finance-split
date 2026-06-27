type Identifier = number | string

export interface SettlementMemberInput {
  id: Identifier
  name: string
  income: string | number
}

export interface SettlementExpenseInput {
  amount: string | number
  paidBy: Identifier
}

export interface SettlementMemberResult {
  id: Identifier
  name: string
  income: string
  percentage: number
  fairShare: string
  paid: string
  balance: string
}

export interface SettlementResult {
  ready: boolean
  reason: string | null
  totalIncome: string
  totalExpenses: string
  members: SettlementMemberResult[]
  settlement: {
    fromUserId: Identifier
    fromName: string
    toUserId: Identifier
    toName: string
    amount: string
  } | null
}

export function yenToBigInt(value: string | number | bigint): bigint {
  const text = String(value ?? '0').trim()
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid money value: ${text}`)
  }
  return BigInt(text)
}

export function calculateSettlement(
  members: SettlementMemberInput[],
  expenses: SettlementExpenseInput[],
): SettlementResult {
  const normalized = members.map((member) => ({
    ...member,
    incomeYen: yenToBigInt(member.income),
    paidYen: 0n,
  }))
  const byId = new Map(normalized.map((member) => [String(member.id), member]))

  let totalExpenses = 0n
  for (const expense of expenses) {
    const amount = yenToBigInt(expense.amount)
    totalExpenses += amount
    const payer = byId.get(String(expense.paidBy))
    if (payer) payer.paidYen += amount
  }

  const totalIncome = normalized.reduce((total, member) => total + member.incomeYen, 0n)

  if (totalIncome === 0n) {
    return {
      ready: false,
      reason: 'Enter household income to calculate the split.',
      totalIncome: '0',
      totalExpenses: String(totalExpenses),
      members: normalized.map((member) => ({
        id: member.id,
        name: member.name,
        income: String(member.incomeYen),
        percentage: 0,
        fairShare: '0',
        paid: String(member.paidYen),
        balance: String(member.paidYen),
      })),
      settlement: null,
    }
  }

  const allocations = normalized.map((member) => {
    const numerator = totalExpenses * member.incomeYen
    return {
      member,
      fairShareYen: numerator / totalIncome,
      remainder: numerator % totalIncome,
    }
  })

  let unallocated =
    totalExpenses - allocations.reduce((total, item) => total + item.fairShareYen, 0n)
  allocations
    .sort((a, b) => (a.remainder > b.remainder ? -1 : a.remainder < b.remainder ? 1 : 0))
    .forEach((item) => {
      if (unallocated > 0n) {
        item.fairShareYen += 1n
        unallocated -= 1n
      }
    })

  const results = allocations
    .map(({ member, fairShareYen }) => ({
      id: member.id,
      name: member.name,
      income: String(member.incomeYen),
      percentage: Number(((member.incomeYen * 10000n) / totalIncome).toString()) / 100,
      fairShare: String(fairShareYen),
      paid: String(member.paidYen),
      balanceYen: member.paidYen - fairShareYen,
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))

  const creditor = results.reduce<(typeof results)[number] | null>(
    (best, member) => (!best || member.balanceYen > best.balanceYen ? member : best),
    null,
  )
  const debtor = results.reduce<(typeof results)[number] | null>(
    (best, member) => (!best || member.balanceYen < best.balanceYen ? member : best),
    null,
  )
  const positiveCreditor = creditor && creditor.balanceYen > 0n ? creditor : null
  const amount = positiveCreditor?.balanceYen ?? 0n

  return {
    ready: true,
    reason: null,
    totalIncome: String(totalIncome),
    totalExpenses: String(totalExpenses),
    members: results.map(({ balanceYen, ...member }) => ({
      ...member,
      balance: String(balanceYen),
    })),
    settlement:
      amount > 0n && debtor && positiveCreditor
        ? {
            fromUserId: debtor.id,
            fromName: debtor.name,
            toUserId: positiveCreditor.id,
            toName: positiveCreditor.name,
            amount: String(amount),
          }
        : null,
  }
}
