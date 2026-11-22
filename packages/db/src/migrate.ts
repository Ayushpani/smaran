import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import postgres from "postgres"

/**
 * Applies migrations/*.sql in filename order, each exactly once, each in
 * its own transaction, recording what ran in `schema_migrations`.
 * All existing migrations are idempotent (IF NOT EXISTS), so a database
 * migrated before tracking existed is safely brought under tracking on
 * its first run.
 */

const url = process.env.DATABASE_URL
if (!url) {
	console.error("DATABASE_URL required")
	process.exit(1)
}

const here = fileURLToPath(new URL(".", import.meta.url))
const migrationsDir = join(here, "..", "migrations")
const files = readdirSync(migrationsDir)
	.filter((f) => f.endsWith(".sql"))
	.sort()

const sql = postgres(url, { max: 1, onnotice: () => {} })

try {
	await sql`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)
	`
	const applied = new Set(
		(await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map(
			(r) => r.name,
		),
	)
	let ran = 0
	for (const f of files) {
		if (applied.has(f)) continue
		const contents = readFileSync(join(migrationsDir, f), "utf8")
		console.log(`→ ${f}`)
		await sql.begin(async (tx) => {
			await tx.unsafe(contents)
			await tx`INSERT INTO schema_migrations (name) VALUES (${f})`
		})
		ran++
	}
	console.log(ran ? `✓ ${ran} migration(s) applied` : "✓ up to date")
} catch (err) {
	console.error("migration failed:", err instanceof Error ? err.message : err)
	process.exit(1)
} finally {
	await sql.end({ timeout: 5 })
}
