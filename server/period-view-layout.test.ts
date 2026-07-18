import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const periodView = readFileSync(resolve('client/src/views/PeriodView.vue'), 'utf8')

function indexOfRequired(text: string) {
  const index = periodView.indexOf(text)
  assert.notEqual(index, -1, `Expected PeriodView.vue to contain ${text}`)
  return index
}

function countOccurrences(text: string) {
  return periodView.split(text).length - 1
}

test('orders period page sections around the mobile expense workflow', () => {
  const periodDate = indexOfRequired('formatDate(period.startDate)')
  const newExpense = indexOfRequired("{{ editingExpenseId ? 'Editing expense' : 'New expense' }}")
  const expenses = indexOfRequired('<p class="eyebrow">Expenses</p>')
  const owedAmounts = indexOfRequired('<p class="eyebrow">Owed amounts</p>')
  const settlement = indexOfRequired('Settlement</p>')
  const split = indexOfRequired('<p class="eyebrow">How it is split</p>')
  const income = indexOfRequired('<p class="eyebrow">Income</p>')
  const recurring = indexOfRequired('<p class="eyebrow">Recurring</p>')
  const savedTemplates = indexOfRequired('<p class="eyebrow">Saved templates</p>')
  const closePeriod = indexOfRequired("{{ isClosed ? 'Reopen period' : 'Close period' }}")

  assert.ok(periodDate < newExpense)
  assert.ok(newExpense < expenses)
  assert.ok(expenses < owedAmounts)
  assert.ok(owedAmounts < settlement)
  assert.ok(settlement < split)
  assert.ok(split < income)
  assert.ok(income < recurring)
  assert.ok(recurring < savedTemplates)
  assert.ok(savedTemplates < closePeriod)
})

test('keeps expense and import controls before the settlement summary', () => {
  const expenseForm = indexOfRequired('id="expense-form"')
  const importToggle = indexOfRequired("{{ showBulkImport ? 'Hide CSV import' : 'Import CSV' }}")
  const importHistory = indexOfRequired('<p class="eyebrow">Import history</p>')
  const settlement = indexOfRequired('Settlement</p>')

  assert.ok(expenseForm < importToggle)
  assert.ok(importToggle < importHistory)
  assert.ok(importHistory < settlement)
})

test('does not render duplicate moved period sections', () => {
  assert.equal(countOccurrences('id="expense-form"'), 1)
  assert.equal(countOccurrences('<p class="eyebrow">Expenses</p>'), 1)
  assert.equal(countOccurrences('<p class="eyebrow">Owed amounts</p>'), 1)
  assert.equal(countOccurrences('<p class="eyebrow">Import history</p>'), 1)
  assert.equal(countOccurrences("{{ isClosed ? 'Reopen period' : 'Close period' }}"), 1)
})

test('leaves period close or reopen as the last action in the template', () => {
  const closePeriod = indexOfRequired("{{ isClosed ? 'Reopen period' : 'Close period' }}")
  const lastButton = periodView.lastIndexOf('</button>')

  assert.ok(closePeriod < lastButton)
  assert.equal(lastButton, periodView.indexOf('</button>', closePeriod))
})
