import { act, createElement as h } from 'react'
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { makeGoalCharts, roundBudgetOf } from '../../../src/client/components/goalCharts'
import type { GoalState } from '../../../src/client/goal'
import { hover, makeKit, mount, query, queryAll, text, unhover } from '../helpers/kit'

const goal: GoalState = {
  id: 'g1', revision: 6, objective: 'A long-running objective', phase: 'paused',
  roundsStarted: 4, maxGoalRounds: 256, createdAt: 1700000000000, updatedAt: 1700000010000, blockedReason: null,
}

test('round bins partition the complete allowance and account for every admitted round', () => {
  for (const limit of [1, 10, 40, 41, 256, 1_000_000, Number.MAX_SAFE_INTEGER]) {
    for (const started of [0, Math.floor(limit / 3), limit]) {
      const result = roundBudgetOf({ ...goal, roundsStarted: started, maxGoalRounds: limit })
      assert.ok(result)
      assert.ok(result.bins.length <= 40)
      assert.equal(result.bins[0].first, 1)
      assert.equal(result.bins.at(-1)?.last, limit)
      assert.equal(result.bins.reduce((sum, bin) => sum + bin.used, 0), started)
      assert.equal(result.remaining, limit - started)
      result.bins.forEach((bin, index) => {
        assert.ok(bin.share >= 0 && bin.share <= 1)
        if (index > 0) assert.equal(bin.first, result.bins[index - 1].last + 1)
      })
    }
  }
})

test('unknown and inconsistent budgets never turn into a fabricated percentage', () => {
  for (const patch of [{ roundsStarted: null }, { maxGoalRounds: null }, { roundsStarted: 257 }]) {
    assert.equal(roundBudgetOf({ ...goal, ...patch }), null)
  }
})

test.each(['en', 'zh'] as const)('renders the screenshot scenario with linked charts and exact counters (%s)', async locale => {
  const kit = makeKit(locale)
  const Charts = makeGoalCharts(kit)
  const m = await mount(h(Charts, { goal }))
  assert.deepEqual(queryAll(m.container, '.gp-kpis dd').map(el => el.textContent), ['4', '252', '256', '1.6%'])
  assert.equal(query(m.container, '.gp-phase-node[data-current="true"]').textContent, kit.t('goal.phase.paused') + kit.t('goal.currentState'))
  assert.equal(queryAll(m.container, '.gp-round-bin').length, 40)
  assert.equal(query(m.container, '.gp-round-bin').title, kit.t('goal.bin', { first: 1, last: 6, used: 4 }))
  const first = query<HTMLButtonElement>(m.container, '.gp-legend-row')
  await hover(first)
  assert.ok(m.container.querySelector('.lc-donut-dim'))
  await unhover(first)
  assert.equal(m.container.querySelector('.lc-donut-dim'), null)
  await act(async () => { first.focus() })
  assert.ok(m.container.querySelector('.lc-donut-dim'))
  await act(async () => { first.blur() })
  assert.equal(m.container.querySelector('.lc-donut-dim'), null)
  await hover(query(m.container, 'circle.lc-donut-seg'))
  assert.ok(m.container.querySelector('.lc-donut-dim'))
  await unhover(query(m.container, '.lc-donut'))
  assert.equal(m.container.querySelector('.lc-donut-dim'), null)
  await m.unmount()
})

test('live updates change state and usage, including zero, cap reached and missing fields', async () => {
  const kit = makeKit()
  const Charts = makeGoalCharts(kit)
  const m = await mount(h(Charts, { goal }))
  for (const phase of ['active', 'paused', 'blocked', 'complete'] as const) {
    await m.update(h(Charts, { goal: { ...goal, phase, roundsStarted: 256 } }))
    assert.equal(queryAll(m.container, '[data-current="true"]').length, 1)
    assert.ok(query(m.container, '[data-current="true"]').textContent.includes(kit.t('goal.phase.' + phase)))
    assert.equal(query(m.container, '.lc-donut-center b').textContent, '100.0%')
    assert.ok(text(m.container).includes(kit.t('goal.capReached')))
  }
  await m.update(h(Charts, { goal: { ...goal, roundsStarted: 0 } }))
  assert.equal(query(m.container, '.lc-donut-center b').textContent, '0.0%')
  assert.equal(m.container.querySelector('.gp-cap-note'), null)
  await m.update(h(Charts, { goal: { ...goal, roundsStarted: null, maxGoalRounds: null } }))
  assert.equal(query(m.container, '.lc-donut-center b').textContent, '—')
  assert.equal(m.container.querySelector('.gp-round-strip'), null)
  assert.ok(text(m.container).includes(kit.t('goal.budgetUnknown')))
  assert.deepEqual(queryAll(m.container, '.gp-kpis dd').map(el => el.textContent), ['—', '—', '—', '—'])
  await m.unmount()
})
