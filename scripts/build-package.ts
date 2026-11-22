#!/usr/bin/env bun
/**
 * Builds a publish-ready copy of a workspace package into
 * <pkg>/dist-publish/: ESM JavaScript + bundled .d.ts, with internal
 * @repo/* workspace code inlined (tree-shaken), a package.json with real
 * semver ranges and no workspace: protocol, plus README and LICENSE.
 *
 * The repo itself keeps exporting TypeScript sources for development.
 *
 *   bun run scripts/build-package.ts packages/sdk-ts [packages/adapter-openai …]
 *   cd packages/sdk-ts/dist-publish && npm publish --access public
 */
import {
	cpSync,
	existsSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { join, resolve } from "node:path"
import { build } from "tsup"

const ROOT = resolve(import.meta.dir, "..")
const dirs = process.argv.slice(2)
if (dirs.length === 0) {
	console.error("usage: bun run scripts/build-package.ts <package-dir> [...]")
	process.exit(1)
}

for (const dir of dirs) {
	const pkgDir = resolve(ROOT, dir)
	const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"))
	const out = join(pkgDir, "dist-publish")
	rmSync(out, { recursive: true, force: true })

	const isWorkspace = (v: string) =>
		typeof v === "string" && v.startsWith("workspace:")
	const deps: Record<string, string> = Object.fromEntries(
		Object.entries((pkg.dependencies ?? {}) as Record<string, string>).filter(
			([, v]) => !isWorkspace(v),
		),
	)
	const peers: Record<string, string> = pkg.peerDependencies ?? {}
	const external = [...Object.keys(deps), ...Object.keys(peers)]

	await build({
		entry: [join(pkgDir, "src/index.ts")],
		outDir: join(out, "dist"),
		format: ["esm"],
		target: "es2022",
		platform: "neutral",
		dts: {
			// Map internal packages to their sources so their types are
			// inlined like local files (they ship .ts, not .d.ts).
			compilerOptions: {
				rootDir: ROOT,
				baseUrl: ROOT,
				paths: { "@repo/*": ["packages/*/src/index.ts"] },
				composite: false,
				incremental: false,
			},
		},
		external: external.flatMap((d) => [
			d,
			new RegExp(`^${d.replace("/", "\\/")}/`),
		]),
		noExternal: [/^@repo\//],
		treeshake: true,
		outExtension: () => ({ js: ".js", dts: ".d.ts" }),
		splitting: false,
		sourcemap: true,
		clean: true,
		silent: true,
		tsconfig: existsSync(join(pkgDir, "tsconfig.json"))
			? join(pkgDir, "tsconfig.json")
			: undefined,
	})

	// tsup names declarations after the root package type; normalize.
	for (const ext of [".d.mts", ".d.cts"]) {
		const f = join(out, `dist/index${ext}`)
		if (existsSync(f)) renameSync(f, join(out, "dist/index.d.ts"))
	}
	const js = readFileSync(join(out, "dist/index.js"), "utf8")
	const dts = readFileSync(join(out, "dist/index.d.ts"), "utf8")
	if (dts.includes("@repo/"))
		throw new Error(`${pkg.name}: type declarations still reference @repo/*`)
	for (const banned of ["@repo/", "@huggingface/transformers", "workspace:"]) {
		if (js.includes(banned))
			throw new Error(`${pkg.name}: built output still references ${banned}`)
	}

	// Peers the built JS never imports are only needed for types: optional.
	const optionalPeers = Object.keys(peers).filter(
		(d) =>
			!new RegExp(`from ["']${d.replace("/", "\\/")}(\\/[^"']*)?["']`).test(js),
	)
	const publishPkg = {
		name: pkg.name,
		version: pkg.version,
		description: pkg.description,
		license: "MIT",
		type: "module",
		main: "./dist/index.js",
		types: "./dist/index.d.ts",
		exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
		files: ["dist", "README.md", "LICENSE"],
		sideEffects: false,
		...(Object.keys(deps).length ? { dependencies: deps } : {}),
		...(Object.keys(peers).length ? { peerDependencies: peers } : {}),
		...(optionalPeers.length
			? {
					peerDependenciesMeta: Object.fromEntries(
						optionalPeers.map((d) => [d, { optional: true }]),
					),
				}
			: {}),
		repository: {
			type: "git",
			url: "git+https://github.com/Ayushpani/smaran.git",
			directory: dir,
		},
		homepage: "https://github.com/Ayushpani/smaran",
		keywords: pkg.keywords ?? ["smaran", "memory", "ai-agents", "voice"],
		engines: { node: ">=18" },
	}
	writeFileSync(
		join(out, "package.json"),
		`${JSON.stringify(publishPkg, null, 2)}\n`,
	)
	if (existsSync(join(pkgDir, "README.md")))
		cpSync(join(pkgDir, "README.md"), join(out, "README.md"))
	cpSync(join(ROOT, "LICENSE"), join(out, "LICENSE"))
	const kb = (Buffer.byteLength(js) / 1024).toFixed(1)
	console.log(
		`✓ ${pkg.name}@${pkg.version} → ${dir}/dist-publish (${kb} KB js)`,
	)
}
