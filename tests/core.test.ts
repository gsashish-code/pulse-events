/// <reference types="vitest/globals" />
import { createEmitter } from '../src/index'

type AppEvents = {
  'user:login': { userId: string; timestamp: number }
  'user:logout': { userId: string }
  'data:loaded': { count: number }
  error: Error
}

function makeEmitter() {
  return createEmitter<AppEvents>()
}

describe('on()', () => {
  it('receives typed payload', async () => {
    const emitter = makeEmitter()
    const received: { userId: string; timestamp: number }[] = []
    emitter.on('user:login', payload => { received.push(payload) })
    await emitter.emit('user:login', { userId: 'u1', timestamp: 1 })
    expect(received).toEqual([{ userId: 'u1', timestamp: 1 }])
  })

  it('returns an unsubscribe function', async () => {
    const emitter = makeEmitter()
    const calls: number[] = []
    const off = emitter.on('data:loaded', () => { calls.push(1) })
    off()
    await emitter.emit('data:loaded', { count: 5 })
    expect(calls).toHaveLength(0)
  })

  it('multiple handlers all fire', async () => {
    const emitter = makeEmitter()
    const calls: number[] = []
    emitter.on('data:loaded', () => { calls.push(1) })
    emitter.on('data:loaded', () => { calls.push(2) })
    await emitter.emit('data:loaded', { count: 0 })
    expect(calls).toContain(1)
    expect(calls).toContain(2)
  })

  it('emitting without listeners does not throw', async () => {
    const emitter = makeEmitter()
    await expect(
      emitter.emit('data:loaded', { count: 0 })
    ).resolves.toBeUndefined()
  })
})

describe('once()', () => {
  it('fires exactly once', async () => {
    const emitter = makeEmitter()
    const calls: number[] = []
    emitter.once('data:loaded', () => { calls.push(1) })
    await emitter.emit('data:loaded', { count: 0 })
    await emitter.emit('data:loaded', { count: 0 })
    expect(calls).toHaveLength(1)
  })
})

describe('off()', () => {
  it('removes specific handler', async () => {
    const emitter = makeEmitter()
    const calls: number[] = []
    const handler = () => { calls.push(1) }
    emitter.on('data:loaded', handler)
    emitter.off('data:loaded', handler)
    await emitter.emit('data:loaded', { count: 0 })
    expect(calls).toHaveLength(0)
  })

  it('without handler removes all listeners for event', async () => {
    const emitter = makeEmitter()
    const calls: number[] = []
    emitter.on('data:loaded', () => { calls.push(1) })
    emitter.on('data:loaded', () => { calls.push(2) })
    emitter.off('data:loaded')
    await emitter.emit('data:loaded', { count: 0 })
    expect(calls).toHaveLength(0)
  })
})

describe('emit()', () => {
  it('awaits async handlers', async () => {
    const emitter = makeEmitter()
    const order: number[] = []
    emitter.on('data:loaded', async () => {
      await new Promise(r => setTimeout(r, 10))
      order.push(1)
    })
    await emitter.emit('data:loaded', { count: 0 })
    expect(order).toEqual([1])
  })

  it('runs handlers in parallel', async () => {
    const emitter = makeEmitter()
    const starts: number[] = []
    emitter.on('data:loaded', async () => {
      starts.push(Date.now())
      await new Promise(r => setTimeout(r, 30))
    })
    emitter.on('data:loaded', async () => {
      starts.push(Date.now())
      await new Promise(r => setTimeout(r, 30))
    })
    await emitter.emit('data:loaded', { count: 0 })
    expect(starts).toHaveLength(2)
    expect(Math.abs(starts[1]! - starts[0]!)).toBeLessThan(20)
  })

  it('handler throwing does not stop other handlers', async () => {
    const emitter = makeEmitter()
    const calls: number[] = []
    emitter.on('data:loaded', () => { throw new Error('boom') })
    emitter.on('data:loaded', () => { calls.push(1) })
    await expect(
      emitter.emit('data:loaded', { count: 0 })
    ).resolves.toBeUndefined()
    expect(calls).toContain(1)
  })
})

describe('next()', () => {
  it('resolves on next emit', async () => {
    const emitter = makeEmitter()
    const p = emitter.next('data:loaded')
    await emitter.emit('data:loaded', { count: 42 })
    await expect(p).resolves.toEqual({ count: 42 })
  })

  it('resolves only once', async () => {
    const emitter = makeEmitter()
    const results: number[] = []
    emitter.next('data:loaded').then(p => results.push(p.count))
    await emitter.emit('data:loaded', { count: 1 })
    await emitter.emit('data:loaded', { count: 2 })
    await Promise.resolve()
    expect(results).toEqual([1])
  })
})

describe('clear()', () => {
  it('clear(event) removes listeners for that event', async () => {
    const emitter = makeEmitter()
    const calls: number[] = []
    emitter.on('data:loaded', () => { calls.push(1) })
    emitter.clear('data:loaded')
    await emitter.emit('data:loaded', { count: 0 })
    expect(calls).toHaveLength(0)
  })

  it('clear() removes all listeners', async () => {
    const emitter = makeEmitter()
    const calls: number[] = []
    emitter.on('data:loaded', () => { calls.push(1) })
    emitter.on('user:login', () => { calls.push(2) })
    emitter.clear()
    await emitter.emit('data:loaded', { count: 0 })
    await emitter.emit('user:login', { userId: 'u1', timestamp: 1 })
    expect(calls).toHaveLength(0)
  })
})

describe('listenerCount()', () => {
  it('accurate before and after removal', () => {
    const emitter = makeEmitter()
    const handler = () => {}
    emitter.on('data:loaded', handler)
    emitter.on('data:loaded', handler)
    expect(emitter.listenerCount('data:loaded')).toBe(2)
    emitter.off('data:loaded', handler)
    expect(emitter.listenerCount('data:loaded')).toBe(1)
  })

  it('returns 0 for unknown event', () => {
    const emitter = makeEmitter()
    expect(emitter.listenerCount('data:loaded')).toBe(0)
  })
})

describe('eventNames()', () => {
  it('returns correct active event names', () => {
    const emitter = makeEmitter()
    emitter.on('data:loaded', () => {})
    emitter.on('user:login', () => {})
    const names = emitter.eventNames()
    expect(names).toContain('data:loaded')
    expect(names).toContain('user:login')
  })

  it('does not include cleared events', () => {
    const emitter = makeEmitter()
    emitter.on('data:loaded', () => {})
    emitter.clear('data:loaded')
    expect(emitter.eventNames()).not.toContain('data:loaded')
  })
})

describe('AbortSignal', () => {
  it('removes listener after abort', async () => {
    const emitter = makeEmitter()
    const calls: number[] = []
    const controller = new AbortController()
    emitter.on('data:loaded', () => { calls.push(1) }, { signal: controller.signal })
    controller.abort()
    await emitter.emit('data:loaded', { count: 0 })
    expect(calls).toHaveLength(0)
  })

  it('aborted listener never fires again', async () => {
    const emitter = makeEmitter()
    const calls: number[] = []
    const controller = new AbortController()
    emitter.on('data:loaded', () => { calls.push(1) }, { signal: controller.signal })
    controller.abort()
    await emitter.emit('data:loaded', { count: 0 })
    await emitter.emit('data:loaded', { count: 0 })
    expect(calls).toHaveLength(0)
  })

  it('abort updates listenerCount()', () => {
    const emitter = makeEmitter()
    const controller = new AbortController()
    emitter.on('data:loaded', () => {}, { signal: controller.signal })
    expect(emitter.listenerCount('data:loaded')).toBe(1)
    controller.abort()
    expect(emitter.listenerCount('data:loaded')).toBe(0)
  })

  it('wildcard listeners support AbortSignal', async () => {
    const emitter = makeEmitter()
    const calls: number[] = []
    const controller = new AbortController()
    emitter.on('user:*', () => { calls.push(1) }, { signal: controller.signal })
    controller.abort()
    await emitter.emitAll('user:login', { userId: 'u1', timestamp: 1 })
    expect(calls).toHaveLength(0)
  })

  it('pre-aborted signal prevents listener from registering', async () => {
    const emitter = makeEmitter()
    const calls: number[] = []
    const controller = new AbortController()
    controller.abort()
    emitter.on('data:loaded', () => { calls.push(1) }, { signal: controller.signal })
    await emitter.emit('data:loaded', { count: 0 })
    expect(calls).toHaveLength(0)
  })
})
