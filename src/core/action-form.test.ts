import { describe, expect, it } from 'vitest'

import { DOUBLE_TAP_PREFIX, gestureLabel, HOLD_PREFIX } from './action-form'

describe('gestureLabel', () => {
  it('says the same words on the tap and on a gesture, with whose they are', () => {
    expect(gestureLabel('confirm')).toBe('Ask before doing it')
    expect(gestureLabel(`${HOLD_PREFIX}confirm`)).toBe('Ask before doing it when held')
    expect(gestureLabel(`${DOUBLE_TAP_PREFIX}confirm`)).toBe(
      'Ask before doing it when double-tapped',
    )
    expect(gestureLabel(`${HOLD_PREFIX}navigation_path`)).toBe('Path when held')
    expect(gestureLabel(`${HOLD_PREFIX}action`)).toBe('When held')
  })

  it("leaves the tap's three oldest rows to each editor", () => {
    expect(gestureLabel('navigation_path')).toBeUndefined()
    expect(gestureLabel('service')).toBeUndefined()
    expect(gestureLabel('action_target')).toBe('Target')
  })

  it('knows nothing of other fields', () => {
    expect(gestureLabel('name')).toBeUndefined()
  })
})
