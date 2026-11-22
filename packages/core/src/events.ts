import type { MemoryEvent } from "./types.ts"

/**
 * Memory event fan-out, keyed by (tenant, session). `publish` may be async
 * for buses that go through an external broker; callers don't await it on
 * the hot path.
 */
export interface EventBus {
	publish(
		tenantId: string,
		sessionId: string | null,
		event: MemoryEvent,
	): void | Promise<void>
	subscribe(tenantId: string, sessionId: string): AsyncIterable<MemoryEvent>
}

/** Single-process bus — the default. Also used as the local fan-out inside shared buses. */
export function createInProcessEventBus(): SessionBus {
	return new SessionBus()
}

const MAX_QUEUED_EVENTS = 1_000

export class SessionBus implements EventBus {
	private listeners = new Map<string, Set<(e: MemoryEvent) => void>>()
	private static key(tenantId: string, sessionId: string): string {
		return `${tenantId}\u0000${sessionId}`
	}
	publish(tenantId: string, sessionId: string | null, event: MemoryEvent) {
		if (sessionId === null) return
		const set = this.listeners.get(SessionBus.key(tenantId, sessionId))
		if (set) for (const l of set) l(event)
	}
	subscribe(tenantId: string, sessionId: string): AsyncIterable<MemoryEvent> {
		const key = SessionBus.key(tenantId, sessionId)
		const queue: MemoryEvent[] = []
		let resolveNext: ((v: IteratorResult<MemoryEvent>) => void) | null = null
		const listener = (e: MemoryEvent) => {
			if (resolveNext) {
				const r = resolveNext
				resolveNext = null
				r({ value: e, done: false })
			} else if (queue.length < MAX_QUEUED_EVENTS) {
				queue.push(e)
			}
		}
		let set = this.listeners.get(key)
		if (!set) {
			set = new Set()
			this.listeners.set(key, set)
		}
		set.add(listener)
		let closed = false
		const close = () => {
			if (closed) return
			closed = true
			set?.delete(listener)
			if (set?.size === 0) this.listeners.delete(key)
			queue.length = 0
			// Wake a consumer parked in next() so its for-await loop exits
			// instead of holding the listener (and its connection) forever.
			if (resolveNext) {
				const r = resolveNext
				resolveNext = null
				r({ value: undefined, done: true })
			}
		}

		return {
			[Symbol.asyncIterator]: () => ({
				next: () => {
					if (queue.length > 0) {
						return Promise.resolve({
							value: queue.shift()!,
							done: false as const,
						})
					}
					if (closed) {
						return Promise.resolve({ value: undefined, done: true as const })
					}
					return new Promise<IteratorResult<MemoryEvent>>((res) => {
						resolveNext = res
					})
				},
				return: () => {
					close()
					return Promise.resolve({ value: undefined, done: true as const })
				},
			}),
		}
	}
}
