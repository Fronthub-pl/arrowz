import { PARAM_SPEC } from '@arrowz/engine'
import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { ValueKnob } from '../console/ValueKnob'
import { OptionSwitch } from '../run/OptionSwitch'
import { useStore } from '../state/store'
import { contrast, parse, shown } from './contrast'
import './tokens.css'
import './shell.css'
import './console.css'

/**
 * This console argues, on purpose, that a knob which does nothing is *not*
 * disabled — it is focusable, operable and it keeps its value — so it cannot
 * claim the exemption WCAG grants disabled controls, and every run of text in
 * it has to clear AA like any other text.
 */
test('no text in an inactive knob is dimmed further than AA allows', async () => {
  useStore.getState().params.reset()
  // giants is 0, so the serpentine knobs do nothing: the same knob
  // ValueKnob.browser.test.tsx uses to assert the `off` class is applied.
  const spec = PARAM_SPEC.find((s) => s.key === 'giantSpan')
  if (!spec) throw new Error('no spec for giantSpan')
  // Inside `.fw`, as on the page: the row's buttons are styled through it,
  // past the `.fw button` reset, and outside it they keep the platform's grey.
  const screen = await render(
    <div className="fw">
      <ValueKnob spec={spec} />
    </div>,
  )
  const knob = screen.container.querySelector('.kv-row.off')
  if (!knob) throw new Error('the knob under test is not in the inactive state')

  // Every element holding text of its own, not a hand-written list of class
  // names: a run this console adds later is measured the day it is added.
  const runs = [...knob.querySelectorAll('*')].filter((node) =>
    [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()),
  )
  expect(runs.length).toBeGreaterThan(2)
  for (const run of runs) {
    const { front, back } = shown(run)
    expect(
      contrast(front, back),
      `${run.className || run.nodeName} reads ${run.textContent?.slice(0, 24)}`,
    ).toBeGreaterThanOrEqual(4.5)
  }
})

// Off, the switch's line keeps a boundary a person can see: at least 3:1
// against the panel (WCAG 1.4.11), which `--border-strong` (1.79:1) is not.
test('a switch is a light square track, and its off line still clears 3:1', async () => {
  // console.css's joined coarse/XS block redraws the switch at XS; this pins
  // the desktop 28×14 look, not the finger's 36×18.
  await page.viewport(1400, 900)
  const screen = await render(
    <div className="fw" style={{ background: 'var(--void)' }}>
      <OptionSwitch id="probe" label="probe" on={false} onChange={() => {}} />
      <OptionSwitch id="probe-on" label="probe on" on onChange={() => {}} />
    </div>,
  )
  const [off, on] = [...screen.container.querySelectorAll<HTMLElement>('.fw-sw')]
  if (off === undefined || on === undefined) throw new Error('no switches')
  const box = off.getBoundingClientRect()
  expect([box.width, box.height]).toEqual([28, 14])
  const style = getComputedStyle(off)
  expect(style.borderTopLeftRadius).toBe('0px')
  expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)')
  const line = parse(style.borderTopColor)
  const back = parse(getComputedStyle(screen.container.firstElementChild ?? off).backgroundColor)
  expect(contrast(line.rgb, back.rgb)).toBeGreaterThanOrEqual(3)
  const onStyle = getComputedStyle(on)
  expect(onStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)')
  expect(onStyle.borderTopColor).toBe(getComputedStyle(on, '::after').backgroundColor)
})
