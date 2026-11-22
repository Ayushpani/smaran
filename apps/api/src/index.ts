import { createApp } from "./app.ts"
import { loadEnv } from "./env.ts"

const env = loadEnv()
const isSandbox = env.STORE === "memory"
const smaran = await createApp(env)
export const app = smaran.app

const port = env.PORT
if (isSandbox) {
	console.log("┌─────────────────────────────────────────────────────────────┐")
	console.log("│ Smaran sandbox mode — data is NOT persisted                 │")
	console.log("├─────────────────────────────────────────────────────────────┤")
	console.log(
		`│ URL:     http://localhost:${port}${" ".repeat(35 - String(port).length)}│`,
	)
	console.log(
		`│ Key:     ${env.SANDBOX_API_KEY}${" ".repeat(51 - env.SANDBOX_API_KEY.length)}│`,
	)
	console.log("│ Restart: memories vanish. Use STORE=supabase for real use.  │")
	console.log("└─────────────────────────────────────────────────────────────┘")
} else {
	console.log(
		`smaran-api → http://localhost:${port} (embedder: ${env.EMBEDDER})`,
	)
}

// Named (not default) export: Bun auto-serves a default export with `fetch`,
// which would double-bind the port alongside Bun.serve below.
export const handler = app.fetch

// When run directly (not imported by tests), serve with graceful shutdown:
// on SIGTERM/SIGINT stop accepting connections, let in-flight requests
// finish, then close connections.
if (import.meta.main) {
	const server = Bun.serve({ port, fetch: app.fetch, idleTimeout: 120 })
	const shutdown = async (signal: string) => {
		console.log(JSON.stringify({ level: "info", msg: "shutdown", signal }))
		await server.stop()
		await smaran.close()
		process.exit(0)
	}
	process.on("SIGTERM", () => void shutdown("SIGTERM"))
	process.on("SIGINT", () => void shutdown("SIGINT"))
}
