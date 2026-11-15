import { describe, expect, it } from 'vitest'

import { isOneOf, oneOf } from './one-of'

const SIZES = ['small', 'large'] as const

describe('oneOf', () => {
  it('keeps a listed value and falls back for anything else', () => {
    expect(oneOf(SIZES, 'large', 'small')).toBe('large')
    expect(oneOf(SIZES, 'Large', 'small')).toBe('small')
    expect(oneOf(SIZES, 3, 'small')).toBe('small')
  })

  it('answers undefined with no fallback', () => {
    expect(oneOf(SIZES, 'huge')).toBeUndefined()
    expect(oneOf(SIZES, 'small')).toBe('small')
  })

  it('is a type guard as isOneOf', () => {
    expect(isOneOf(SIZES, 'small')).toBe(true)
    expect(isOneOf(SIZES, undefined)).toBe(false)
  })
})
