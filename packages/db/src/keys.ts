#!/usr/bin/env bun
/**
 * Tenant and API-key administration. Keys are shown once at creation;
 * only their SHA-256 hash is stored.
 *
 *   bun run keys tenant:create "<name>"          → tenant id + first key
 *   bun run keys key:create <tenantId> [label]   → new key for a tenant
 *   bun run keys key:list <tenantId>             → key ids, labels, status
 *   bun run keys key:revoke <keyId>              → revoke (effective ≤30s)
 *   bun run keys tenant:list
 *   bun run keys invite:create [note]           → single-use signup code (SIGNUP_MODE=invite)
 *   bun run keys tenant:limits <tenantId> <memoryQuota|null> <reqPerMin|null> [plan]
 */
import postgres from "postgres"

const url = process.env.DATABASE_URL
if (!url) {
	console.error("DATABASE_URL required")
	process.exit(1)
}

const hex = (bytes: number) => {
	const a = new Uint8Array(bytes)
	crypto.getRandomValues(a)
	return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("")
}
const sha256 = async (s: string) =>
	Array.from(
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
		),
		(b) => b.toString(16).padStart(2, "0"),
	).join("")

const sql = postgres(url, { max: 1, onnotice: () => {} })

async function createKey(tenantId: string, label: string) {
	const raw = `sk_${hex(24)}`
	const id = `key_${hex(8)}`
	await sql`INSERT INTO api_keys (id, tenant_id, hashed_key, label) VALUES (${id}, ${tenantId}, ${await sha256(raw)}, ${label})`
	console.log(`key id : ${id}`)
	console.log(`api key: ${raw}`)
	console.log("(shown once — only the hash is stored)")
}

const [cmd, a, b] = process.argv.slice(2)
try {
	switch (cmd) {
		case "tenant:create": {
			if (!a) throw new Error('usage: tenant:create "<name>"')
			const id = `ten_${hex(8)}`
			await sql`INSERT INTO tenants (id, name) VALUES (${id}, ${a})`
			console.log(`tenant : ${id} (${a})`)
			await createKey(id, "initial")
			break
		}
		case "tenant:list": {
			const rows = await sql`
				SELECT t.id, t.name, t.created_at,
					count(k.*) FILTER (WHERE k.revoked_at IS NULL) AS active_keys
				FROM tenants t LEFT JOIN api_keys k ON k.tenant_id = t.id
				GROUP BY t.id ORDER BY t.created_at`
			console.table(rows)
			break
		}
		case "key:create": {
			if (!a) throw new Error("usage: key:create <tenantId> [label]")
			const [t] = await sql`SELECT id FROM tenants WHERE id = ${a}`
			if (!t) throw new Error(`no tenant ${a}`)
			await createKey(a, b ?? "")
			break
		}
		case "key:list": {
			if (!a) throw new Error("usage: key:list <tenantId>")
			console.table(
				await sql`SELECT id, label, created_at, revoked_at FROM api_keys WHERE tenant_id = ${a} ORDER BY created_at`,
			)
			break
		}
		case "key:revoke": {
			if (!a) throw new Error("usage: key:revoke <keyId>")
			const r =
				await sql`UPDATE api_keys SET revoked_at = now() WHERE id = ${a} AND revoked_at IS NULL RETURNING id`
			if (r.length === 0) throw new Error(`no active key ${a}`)
			console.log(`revoked ${a} (cached auth may accept it for up to 30s)`)
			break
		}
		default:
			console.log(
				"commands: tenant:create, tenant:list, key:create, key:list, key:revoke",
			)
			if (cmd) process.exitCode = 1
	}
} catch (err) {
	console.error(err instanceof Error ? err.message : err)
	process.exitCode = 1
} finally {
	await sql.end({ timeout: 5 })
}
