/// <reference types="vitest/globals" />
import { patternToRegExp, isWildcardPattern, matchesPattern } from '../src/core/wildcard'
import { createEmitter } from '../src/index'

type AppEvents = {
  'user:login': { userId: string; timestamp: number }
  'user:logout': { userId: string }
  'data:loaded': { count: number }
  error: Error
}

describe('patternToRegExp', () => {
  it('converts "user:*" to ^user:[^\\s]+$', () => {
    expect(patternToRegExp('user:*').source).toBe('^user:[^\\s]+$')
  })

  it('converts "*.error" to ^[^\\s]+\\.error$', () => {
    expect(patternToRegExp('*.error').source).toBe('^[^\\s]+\\.error$')
  })

  it('converts "*" to ^[^\\s]+$', () => {
    expect(patternToRegExp('*').source).toBe('^[^\\s]+$')
  })

  it('converts "a:*:b" to ^a:[^\\s]+:b$', () => {
    expect(patternToRegExp('a:*:b').source).toBe('^a:[^\\s]+:b$')
  })

  it('converts "user:**" to ^user:.+$', () => {
    expect(patternToRegExp('user:**').source).toBe('^user:.+$')
  })
})

describe('isWildcardPattern', () => {
  it('returns true when pattern contains *', () => {
    expect(isWildcardPattern('user:*')).toBe(true)
  })

  it('returns true when pattern contains **', () => {
    expect(isWildcardPattern('user:**')).toBe(true)
  })

  it('returns false when pattern has no wildcard', () => {
    expect(isWildcardPattern('user:login')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isWildcardPattern('')).toBe(false)
  })
})

describe('matchesPattern', () => {
  describe('single wildcard (*)', () => {
    it('"user:*" matches "user:login"', () => {
      expect(matchesPattern('user:*', 'user:login')).toBe(true)
    })

    it('"user:*" matches "user:logout"', () => {
      expect(matchesPattern('user:*', 'user:logout')).toBe(true)
    })

    it('"user:*" does not match "user:" (empty segment)', () => {
      expect(matchesPattern('user:*', 'user:')).toBe(false)
    })

    it('"*.error" matches "db.error"', () => {
      expect(matchesPattern('*.error', 'db.error')).toBe(true)
    })

    it('"*.error" does not match ".error" (empty prefix)', () => {
      expect(matchesPattern('*.error', '.error')).toBe(false)
    })

    it('"*" matches any single non-whitespace token', () => {
      expect(matchesPattern('*', 'anything')).toBe(true)
    })

    it('"*" does not match a string with spaces', () => {
      expect(matchesPattern('*', 'has space')).toBe(false)
    })

    it('"a:*:b" matches "a:x:b"', () => {
      expect(matchesPattern('a:*:b', 'a:x:b')).toBe(true)
    })

    it('"a:*:b" does not match "a::b" (empty middle segment)', () => {
      expect(matchesPattern('a:*:b', 'a::b')).toBe(false)
    })
  })

  describe('deep wildcard (**)', () => {
    it('"user:**" matches "user:login:extra"', () => {
      expect(matchesPattern('user:**', 'user:login:extra')).toBe(true)
    })

    it('"user:**" matches "user:login"', () => {
      expect(matchesPattern('user:**', 'user:login')).toBe(true)
    })

    it('"user:**" does not match "user:" (nothing after prefix)', () => {
      expect(matchesPattern('user:**', 'user:')).toBe(false)
    })
  })

  describe('literal pattern (no wildcard)', () => {
    it('matches exact string', () => {
      expect(matchesPattern('user:login', 'user:login')).toBe(true)
    })

    it('does not match a different string', () => {
      expect(matchesPattern('user:login', 'user:logout')).toBe(false)
    })
  })
})

describe('emitAll() wildcard dispatch', () => {
  it('"user:*" matches only user namespace events', async () => {
    const emitter = createEmitter<AppEvents>()
    const received: string[] = []
    emitter.on('user:*', (_payload, eventName) => { received.push(eventName) })
    await emitter.emitAll('user:login', { userId: 'u1', timestamp: 1 })
    await emitter.emitAll('user:logout', { userId: 'u1' })
    await emitter.emitAll('data:loaded', { count: 5 })
    expect(received).toContain('user:login')
    expect(received).toContain('user:logout')
    expect(received).not.toContain('data:loaded')
  })

  it('"*" wildcard matches everything', async () => {
    const emitter = createEmitter<AppEvents>()
    const received: string[] = []
    emitter.on('*', (_payload, eventName) => { received.push(eventName) })
    await emitter.emitAll('user:login', { userId: 'u1', timestamp: 1 })
    await emitter.emitAll('data:loaded', { count: 5 })
    expect(received).toContain('user:login')
    expect(received).toContain('data:loaded')
  })

  it('wildcard handler receives payload and eventName', async () => {
    const emitter = createEmitter<AppEvents>()
    let capturedName = ''
    let capturedPayload: unknown
    emitter.on('user:*', (payload, eventName) => {
      capturedPayload = payload
      capturedName = eventName
    })
    await emitter.emitAll('user:login', { userId: 'u1', timestamp: 1 })
    expect(capturedName).toBe('user:login')
    expect(capturedPayload).toEqual({ userId: 'u1', timestamp: 1 })
  })

  it('emitAll fires both exact and wildcard listeners', async () => {
    const emitter = createEmitter<AppEvents>()
    const calls: string[] = []
    emitter.on('user:login', () => { calls.push('exact') })
    emitter.on('user:*', () => { calls.push('wildcard') })
    await emitter.emitAll('user:login', { userId: 'u1', timestamp: 1 })
    expect(calls).toContain('exact')
    expect(calls).toContain('wildcard')
  })
})
