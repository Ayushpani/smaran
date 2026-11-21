#!/usr/bin/env bun

/**
 * Smaran CLI. Deliberately tiny — the point is that a first-time user
 * can go from `npx smaran try` to a live memory API in ten seconds.
 *
 * Subcommands:
 *   try   — spins up an in-memory API on :8787 with a hardcoded key.
 *   init  — writes an apps/api/.env from a prompt-driven flow.
 *   help  — this help.
 */

import { spawn } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = findRepoRoot(HERE)

function findRepoRoot(start: string): string {
	let cur = start
	for (let i = 0; i < 8; i++) {
		if (existsSync(join(cur, "turbo.json"))) return cur
		const parent = dirname(cur)
		if (parent === cur) break
		cur = parent
	}
	return start
}

function help(): void {
	console.log(`
smaran — voice-memory infrastructure

Usage:
  smaran try                     Run the API in in-memory sandbox mode.
                                 Zero setup. Perfect for a first tour.

  smaran init [--supabase URL]   Interactive setup for a persistent
                                 Supabase-backed deployment.

  smaran help                    Show this message.

Docs: https://github.com/Ayushpani/smaran/blob/main/DOCS.md
`)
}

function runApi(env: Record<string, string>): void {
	const apiDir = join(REPO_ROOT, "apps", "api")
	if (!existsSync(join(apiDir, "src", "index.ts"))) {
		console.error(
			"error: could not find apps/api/src/index.ts — is smaran-cli " +
				"running from the monorepo?",
		)
		process.exit(1)
	}
	const child = spawn("bun", ["run", join(apiDir, "src", "index.ts")], {
		stdio: "inherit",
		env: { ...process.env, ...env },
	})
	child.on("exit", (code) => process.exit(code ?? 0))
}

function tryCmd(): void {
	runApi({
		STORE: "memory",
		PORT: process.env.PORT ?? "8787",
		EMBEDDER: process.env.EMBEDDER ?? "local",
		SANDBOX_API_KEY: process.env.SANDBOX_API_KEY ?? "sk_local_dev",
	})
}

function initCmd(argv: string[]): void {
	const idx = argv.indexOf("--supabase")
	const url = idx >= 0 ? argv[idx + 1] : undefined
	if (!url) {
		console.error(
			"error: pass --supabase <pooled-connection-url>\n" +
				"       (Dashboard → Settings → Database → Connection string → Transaction pooler)",
		)
		process.exit(1)
	}
	const envPath = resolve(REPO_ROOT, "apps", "api", ".env")
	if (existsSync(envPath)) {
		console.error(`refusing to overwrite existing ${envPath}`)
		process.exit(1)
	}
	const contents = [
		"# Persistent mode — Supabase Postgres + pgvector.",
		"STORE=supabase",
		`DATABASE_URL=${url}`,
		"PORT=8787",
		"EMBEDDER=local",
		"CORS_ORIGIN=*",
		"",
	].join("\n")
	writeFileSync(envPath, contents, "utf8")
	console.log(`wrote ${envPath}`)
	console.log("next:")
	console.log(`  DATABASE_URL='${url}' bun --filter '@repo/db' db:migrate`)
	console.log(`  DATABASE_URL='${url}' bun --filter '@repo/db' db:seed dev`)
	console.log(`  bun --filter '@repo/api' dev`)
}

const [, , cmd, ...rest] = process.argv
switch (cmd) {
	case "try":
		tryCmd()
		break
	case "init":
		initCmd(rest)
		break
	case undefined:
	case "help":
	case "--help":
	case "-h":
		help()
		break
	default:
		console.error(`unknown command: ${cmd}`)
		help()
		process.exit(1)
}
