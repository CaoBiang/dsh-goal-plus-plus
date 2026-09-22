import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { test, vi } from 'vitest'
import { RingDetails } from '../../../src/client/components/ringDetails'
import { click, hover, keydown, mount, query, unhover } from '../helpers/kit'

test('ring details portal supports hover transfer, focus, click, Escape and cleanup', async () => {
  vi.useFakeTimers()
  const m = await mount(h(RingDetails, { title: 'Usage', details: h('span', null, 'Legend'), children: 'Ring' }))
  try {
    const anchor = query(m.container, 'button')
    const panel = () => document.body.querySelector('.gp-ring-details')
    assert.equal(panel(), null)
    await hover(anchor)
    assert.ok(panel())
    assert.equal(m.container.querySelector('.gp-ring-details'), null)
    await unhover(anchor)
    await hover(query(document.body, '.gp-ring-details'))
    await act(async () => { vi.advanceTimersByTime(200) })
    assert.ok(panel())
    await unhover(query(document.body, '.gp-ring-details'))
    await act(async () => { vi.advanceTimersByTime(200) })
    assert.equal(panel(), null)
    await act(async () => { anchor.focus() })
    assert.ok(panel())
    await keydown('Enter')
    assert.ok(panel())
    await keydown('Escape')
    assert.equal(panel(), null)
    await click(anchor)
    assert.ok(panel())
    await act(async () => { anchor.blur() })
    assert.equal(panel(), null)
    await hover(anchor)
    await unhover(anchor)
  } finally {
    await m.unmount()
    await act(async () => { vi.runAllTimers() })
    vi.useRealTimers()
  }
  assert.equal(document.body.querySelector('.gp-ring-details'), null)
})
