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
    let isReplaying = false

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
        if (!isReplaying) {
            historyStore.push({
                event,
                payload,
                timestamp: Date.now()
            })
            if (historyLimit && historyStore.length > historyLimit) {
                historyStore.shift()
            }
        }

        const entries = listeners.get(event)
        if (!entries || entries.size === 0) {
            return
        }

        // Snapshot before iteration
        const snapshot = [...entries]

        const tasks = snapshot.map(entry => {
            // Remove once listeners immediately
            if (entry.once) {
                entries.delete(entry)
            }
            // Use .then() so synchronous throws are also caught
            return Promise.resolve()
                .then(() => (entry.handler as Handler<unknown>)(payload))
                .catch(() => {})
        })

        await Promise.all(tasks)

        // Cleanup empty sets
        if (entries.size === 0) {
            listeners.delete(event)
        }
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
  * Emit exact listeners + matching wildcard listeners.
  */
    async function emitAll<
        K extends keyof T & string
    >(
        event: K,
        payload: T[K]
    ): Promise<void> {

        // Record history before handlers run, consistent with emit()
        if (!isReplaying) {
            historyStore.push({
                event,
                payload,
                timestamp: Date.now()
            })
            if (historyLimit && historyStore.length > historyLimit) {
                historyStore.shift()
            }
        }

        const tasks: Promise<void>[] = []

        /**
         * ---------------------------------------------------
         * Exact listeners
         * ---------------------------------------------------
         */

        const exactEntries =
            listeners.get(event)

        if (exactEntries) {

            // Snapshot before iteration
            const snapshot = [...exactEntries]

            for (const entry of snapshot) {

                // Remove once listeners immediately
                if (entry.once) {
                    exactEntries.delete(entry)
                }

                const task = Promise.resolve()
                    .then(() => (entry.handler as Handler<unknown>)(payload))
                    .catch(() => {})

                tasks.push(task)
            }

            // Cleanup empty set
            if (exactEntries.size === 0) {
                listeners.delete(event)
            }
        }

        /**
         * ---------------------------------------------------
         * Wildcard listeners
         * ---------------------------------------------------
         */

        // Snapshot keys before iteration
        const allKeys = [...listeners.keys()]

        for (const key of allKeys) {

            // Skip exact key
            if (key === event) {
                continue
            }

            // Skip non-wildcards
            if (!isWildcardPattern(key)) {
                continue
            }

            // Skip non-matching patterns
            if (!matchesPattern(key, event)) {
                continue
            }

            const wildcardEntries =
                listeners.get(key)

            if (!wildcardEntries) {
                continue
            }

            // Snapshot before iteration
            const snapshot = [...wildcardEntries]

            for (const entry of snapshot) {

                // Remove once listeners immediately
                if (entry.once) {
                    wildcardEntries.delete(entry)
                }

                const task = Promise.resolve()
                    .then(() => (entry.handler as WildcardHandler)(payload, event))
                    .catch(() => {})

                tasks.push(task)
            }

            // Cleanup empty set
            if (wildcardEntries.size === 0) {
                listeners.delete(key)
            }
        }

        /**
         * ---------------------------------------------------
         * Run everything in parallel
         * ---------------------------------------------------
         */

        await Promise.all(tasks)
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
            isReplaying = true
            try {
                for (const entry of entries) {
                    try {
                        await emitAll(
                            entry.event as K,
                            entry.payload as T[K]
                        )
                    } catch {
                        // failed replay entry must not stop the rest
                    }
                }
            } finally {
                isReplaying = false
            }
        },

        async replaySince(timestamp: number): Promise<void> {
            const entries = historyStore.filter(
                e => e.timestamp >= timestamp
            )
            isReplaying = true
            try {
                for (const entry of entries) {
                    try {
                        await emitAll(
                            entry.event as keyof T & string,
                            entry.payload as T[keyof T & string]
                        )
                    } catch {
                        // failed replay entry must not stop the rest
                    }
                }
            } finally {
                isReplaying = false
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