import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateSettlement } from './settlement.ts'

test('calculates a proportional two-person settlement', () => {
  const result = calculateSettlement(
    [
      { id: 1, name: 'Alex', income: '600000' },
      { id: 2, name: 'Sam', income: '400000' },
    ],
    [
      { amount: '450000', paidBy: 1 },
      { amount: '50000', paidBy: 2 },
    ],
  )

  assert.equal(result.totalExpenses, '500000')
  assert.equal(result.members[0].fairShare, '300000')
  assert.deepEqual(result.settlement, {
    fromUserId: 2,
    fromName: 'Sam',
    toUserId: 1,
    toName: 'Alex',
    amount: '150000',
  })
})

test('allocates every yen when percentages produce fractions', () => {
  const result = calculateSettlement(
    [
      { id: 1, name: 'Alex', income: '1' },
      { id: 2, name: 'Sam', income: '2' },
    ],
    [{ amount: '1', paidBy: 1 }],
  )

  assert.equal(
    result.members.reduce((sum, member) => sum + Number(member.fairShare), 0),
    1,
  )
})

test('does not calculate percentages without income', () => {
  const result = calculateSettlement(
    [
      { id: 1, name: 'Alex', income: '0' },
      { id: 2, name: 'Sam', income: '0' },
    ],
    [{ amount: '10', paidBy: 1 }],
  )

  assert.equal(result.ready, false)
  assert.equal(result.totalExpenses, '10')
})
