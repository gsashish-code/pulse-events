import type {
    EventMap,
    Handler,
    HandlerEntry,
    Emitter,
    HistoryEntry,
    ReplayOptions,
    ListenerOptions,
    InspectResult,
    WildcardHandler
} from './types'

import {
    isWildcardPattern,
    matchesPattern
} from './wildcard'

export function createEmitter<
    T extends EventMap
>(options?: { historyLimit?: number }): Emitter<T> {
    const { historyLimit } = options ?? {}

    /**
     * Internal listener registry.
     *
     * Key:
     * - exact event name
     * - wildcard pattern
     *
     * Value:
     * - registered listener entries
     */
    const listeners = new Map<
        string,
        Set<HandlerEntry>
    >()

    /**
     * Internal event history store.
     *
     * Stores emitted events in order.
     */
    const historyStore: HistoryEntry[] = []

    function on<K extends keyof T & string>(event: K, handler: Handler<T[K]>, options?: ListenerOptions): () => void
    function on(event: string, handler: WildcardHandler, options?: ListenerOptions): () => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function on(event: string, handler: Handler<any> | WildcardHandler, options?: ListenerOptions): () => void {

        const isWildcard =
            isWildcardPattern(event)

        const entry: HandlerEntry = {
            handler: handler as Handler<unknown>,
            once: false,
            isWildcard
        }

        if (!listeners.has(event)) {
            listeners.set(event, new Set())
        }

        listeners.get(event)!.add(entry)

        /**
         * Abort controller
         */
        const signal = options?.signal;
        if (signal) {
            if (signal.aborted) {
                listeners.get(event)?.delete(entry);
                if (listeners.get(event)?.size === 0) {
                    listeners.delete(event)
                }
            } else {
                signal.addEventListener('abort', () => {
                    listeners.get(event)?.delete(entry);
                    // Cleanup empty set
                    if (
                        listeners.get(event)?.size === 0
                    ) {
                        listeners.delete(event)
                    }
                }, { once: true });
            }
        }
        /**
        * Manual unsubscribe
        */
        return () => {

            listeners
                .get(event)
                ?.delete(entry)

            // Cleanup empty set
            if (
                listeners.get(event)?.size === 0
            ) {
                listeners.delete(event)
            }
        }
    }

    function once<
        K extends keyof T & string
    >(
        event: K,
        handler: Handler<T[K]>,
        options?: ListenerOptions
    ): () => void {

        const isWildcard =
            isWildcardPattern(event)

        const entry: HandlerEntry = {
            handler: handler as Handler<unknown>,
            once: true,
            isWildcard
        }

        if (!listeners.has(event)) {
            listeners.set(event, new Set())
        }

        listeners.get(event)!.add(entry)

        /**
   * ----------------------------------------
   * AbortSignal support
   * ----------------------------------------
   */

        const signal = options?.signal

        if (signal) {

            // Already aborted
            if (signal.aborted) {
                listeners
                    .get(event)
                    ?.delete(entry)
            }

            // Remove listener on abort
            else {
                signal.addEventListener(
                    'abort',
                    () => {
                        listeners
                            .get(event)
                            ?.delete(entry)

                        // Cleanup empty set
                        if (
                            listeners.get(event)?.size === 0
                        ) {
                            listeners.delete(event)
                        }
                    },
                    {
                        once: true
                    }
                )
            }
        }

        /**
         * Manual unsubscribe
         */
        return () => {

            listeners
                .get(event)
                ?.delete(entry)

            // Cleanup empty set
            if (
                listeners.get(event)?.size === 0
            ) {
                listeners.delete(event)
            }
        }
    }

    /**
     * Remove listeners.
     */
    function off<
        K extends keyof T & string
    >(
        event: K,
        handler?: Handler<T[K]>
    ): void {

        // Remove all listeners
        if (!handler) {
            listeners.delete(event)
            return
        }

        const entries =
            listeners.get(event)

        if (!entries) {
            return
        }

        for (const entry of entries) {
            if (entry.handler === handler) {
                entries.delete(entry)
                break
            }
        }

        // Cleanup empty sets
        if (entries.size === 0) {
            listeners.delete(event)
        }
    }

    /**
     * Emit exact-match listeners only.
     */
    async function emit<
        K extends keyof T & string
    >(
        event: K,
        payload: T[K]
    ): Promise<void> {

        // Record history regardless of whether there are listeners
        historyStore.push({
            event,
            payload,
            timestamp: Date.now()
        })
        if (historyLimit !== undefined && historyStore.length > historyLimit) {
            historyStore.shift()
        }

        const entries = listeners.get(event)
        if (!entries || entries.size === 0) {
            return
        }

        // Snapshot before iteration
        const snapshot = [...entries]

        const tasks = snapshot.map(entry => {
            if (entry.once) entries.delete(entry)
            return Promise.resolve()
                .then(() => (entry.handler as Handler<unknown>)(payload))
        })

        const results = await Promise.allSettled(tasks)

        if (entries.size === 0) listeners.delete(event)

        const firstRejection = results.find(
            (r): r is PromiseRejectedResult => r.status === 'rejected'
        )
        if (firstRejection) throw firstRejection.reason
    }

    /**
     * Clear listeners.
     */
    function clear(
        event?: string
    ): void {

        // Clear one event
        if (event) {
            listeners.delete(event)
            return
        }

        // recuresively clean
        listeners.clear()
    }

    /**
     * Get listener count.
     */
    function listenerCount(
        event: string
    ): number {

        return (
            listeners.get(event)?.size ?? 0
        )
    }

    /**
     * Get active event names.
     */
    function eventNames(): string[] {

        return [...listeners.keys()]
            .filter(
                key =>
                    (listeners.get(key)?.size ?? 0) > 0
            )
    }

    /**
     * Internal dispatcher shared by emitAll (public) and replay (private).
     * recordHistory=false lets replay re-fire events without polluting history,
     * while still allowing handler-triggered emits to be recorded normally.
     */
    async function _dispatchAll<
        K extends keyof T & string
    >(
        event: K,
        payload: T[K],
        recordHistory: boolean
    ): Promise<void> {

        if (recordHistory) {
            historyStore.push({
                event,
                payload,
                timestamp: Date.now()
            })
            if (historyLimit !== undefined && historyStore.length > historyLimit) {
                historyStore.shift()
            }
        }

        const tasks: Promise<void>[] = []

        const exactEntries = listeners.get(event)
        if (exactEntries) {
            const snapshot = [...exactEntries]
            for (const entry of snapshot) {
                if (entry.once) exactEntries.delete(entry)
                tasks.push(
                    Promise.resolve()
                        .then(() => (entry.handler as Handler<unknown>)(payload))
                )
            }
            if (exactEntries.size === 0) listeners.delete(event)
        }

        const allKeys = [...listeners.keys()]
        for (const key of allKeys) {
            if (key === event) continue
            if (!isWildcardPattern(key)) continue
            if (!matchesPattern(key, event)) continue

            const wildcardEntries = listeners.get(key)
            if (!wildcardEntries) continue

            const snapshot = [...wildcardEntries]
            for (const entry of snapshot) {
                if (entry.once) wildcardEntries.delete(entry)
                tasks.push(
                    Promise.resolve()
                        .then(() => (entry.handler as WildcardHandler)(payload, event))
                )
            }
            if (wildcardEntries.size === 0) listeners.delete(key)
        }

        const results = await Promise.allSettled(tasks)
        const firstRejection = results.find(
            (r): r is PromiseRejectedResult => r.status === 'rejected'
        )
        if (firstRejection) throw firstRejection.reason
    }

    /**
     * Emit exact listeners + matching wildcard listeners.
     */
    async function emitAll<
        K extends keyof T & string
    >(
        event: K,
        payload: T[K]
    ): Promise<void> {
        return _dispatchAll(event, payload, true)
    }

    /**
 * Wait for the next occurrence
 * of an event.
 *
 * Resolves once, then automatically
 * unsubscribes itself.
 */
    function next<
        K extends keyof T & string
    >(
        event: K
    ): Promise<T[K]> {

        return new Promise<T[K]>(
            resolve => {

                once(
                    event,
                    resolve
                )

            }
        )
    }
    function history(): HistoryEntry[]
    function history<K extends keyof T & string>(event: K): HistoryEntry<T[K]>[]
    function history<K extends keyof T & string>(event?: K): HistoryEntry[] | HistoryEntry<T[K]>[] {
        if (event === undefined) {
            return [...historyStore]
        }
        return historyStore.filter(e => e.event === event) as HistoryEntry<T[K]>[]
    }

    return {
        on,
        once,
        off,
        emit,
        clear,
        listenerCount,
        eventNames,
        emitAll,
        next,

        history,

        async replay<K extends keyof T & string>(
            event: K,
            options?: ReplayOptions
        ): Promise<void> {
            let entries = historyStore.filter(
                e => e.event === event
            )
            if (options?.limit !== undefined) {
                entries = entries.slice(-options.limit)
            }
            for (const entry of entries) {
                try {
                    await _dispatchAll(
                        entry.event as K,
                        entry.payload as T[K],
                        false
                    )
                } catch {
                    // failed replay entry must not stop the rest
                }
            }
        },

        async replaySince(timestamp: number): Promise<void> {
            const entries = historyStore.filter(
                e => e.timestamp >= timestamp
            )
            for (const entry of entries) {
                try {
                    await _dispatchAll(
                        entry.event as keyof T & string,
                        entry.payload as T[keyof T & string],
                        false
                    )
                } catch {
                    // failed replay entry must not stop the rest
                }
            }
        },

        inspect(): InspectResult {
            const events = [...listeners.keys()]
                .filter(key => (listeners.get(key)?.size ?? 0) > 0)
                .map(name => ({
                    name,
                    listeners: listeners.get(name)!.size
                }))
            return { events }
        },
    }
}