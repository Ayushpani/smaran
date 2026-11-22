import { PostHog } from "posthog-node"

const MCP_SERVER_VERSION = "0.1.0"

/**
 * PostHog singleton for analytics.
 */
let instance: PostHog | null = null
let initialized = false

/**
 * Initialize PostHog with the provided API key.
 */
export function initPosthog(apiKey?: string): void {
	if (initialized) return
	initialized = true

	if (!apiKey) {
		return
	}

	instance = new PostHog(apiKey, {
		host: "https://us.i.posthog.com",
	})
}

function getInstance(): PostHog | null {
	if (!initialized) {
		console.warn(
			"PostHog not initialized. Call initPosthog(apiKey) during worker startup.",
		)
	}
	return instance
}

export async function memoryAdded(props: {
	type: "note" | "link" | "file"
	content_length?: number
	source?: string
	userId: string
	mcp_client_name?: string
	mcp_client_version?: string
	sessionId?: string
}): Promise<void> {
	const client = getInstance()
	if (!client) return

	try {
		client.capture({
			distinctId: props.userId,
			event: "memory_added",
			properties: {
				...props,
				mcp_server_version: MCP_SERVER_VERSION,
			},
		})
	} catch (error) {
		console.error("PostHog tracking error:", error)
	}
}

export async function memorySearch(props: {
	query_length: number
	results_count: number
	search_duration_ms: number
	source?: string
	userId: string
	mcp_client_name?: string
	mcp_client_version?: string
	sessionId?: string
}): Promise<void> {
	const client = getInstance()
	if (!client) return

	try {
		client.capture({
			distinctId: props.userId,
			event: "memory_search",
			properties: {
				...props,
				mcp_server_version: MCP_SERVER_VERSION,
			},
		})
	} catch (error) {
		console.error("PostHog tracking error:", error)
	}
}

export async function memoryForgot(props: {
	userId: string
	content_length?: number
	source?: string
	mcp_client_name?: string
	mcp_client_version?: string
	sessionId?: string
}): Promise<void> {
	const client = getInstance()
	if (!client) return

	try {
		client.capture({
			distinctId: props.userId,
			event: "memory_forgot",
			properties: {
				...props,
				mcp_server_version: MCP_SERVER_VERSION,
			},
		})
	} catch (error) {
		console.error("PostHog tracking error:", error)
	}
}

export async function shutdown(): Promise<void> {
	if (instance) {
		await instance.shutdown()
		instance = null
		initialized = false
	}
}

export const posthog = {
	init: initPosthog,
	memoryAdded,
	memorySearch,
	memoryForgot,
	shutdown,
}
