import Link from "next/link"
import { Sidebar } from "@/components/docs/Sidebar"
import { SIDEBAR } from "@/lib/docs"

export const metadata = {
	title: "Docs · Smaran",
	description: "Ship a voice-native memory layer in five minutes.",
}

const HERO_CARDS = [
	{
		slug: "docs/quickstart",
		title: "Quickstart",
		body: "Zero to first saved memory in under a minute. One command, no account.",
	},
	{
		slug: "docs/voice",
		title: "Voice concepts",
		body: "Partial + commit, self-correction, filler scrub. How the pipeline actually thinks.",
	},
	{
		slug: "docs/sdk",
		title: "TypeScript SDK",
		body: "Typed client with retries: save, recall, voice ingest, DPDP. Any fetch runtime.",
	},
	{
		slug: "docs/api",
		title: "REST API",
		body: "One endpoint per operation. Bring your key, get your memory.",
	},
]

export default function DocsIndex() {
	return (
		<div className="doc-shell">
			<Sidebar current="docs" />
			<main className="doc-main doc-index">
				<div className="doc-eyebrow">Documentation</div>
				<h1 className="doc-index-h1">
					Ship a voice-native memory layer in <em>five minutes.</em>
				</h1>
				<p className="doc-index-lede">
					Smaran is a memory layer for AI voice agents that corrects itself the
					way a good listener does. Pick a starting point below, or use the
					sidebar to jump anywhere.
				</p>
				<div className="doc-grid">
					{HERO_CARDS.map((c) => (
						<Link key={c.slug} href={`/${c.slug}`} className="doc-card">
							<div className="doc-card-t">{c.title}</div>
							<div className="doc-card-b">{c.body}</div>
							<div className="doc-card-arr">→</div>
						</Link>
					))}
				</div>
				<div className="doc-index-more">
					<div className="doc-index-more-h">Everything else</div>
					<div className="doc-index-more-list">
						{SIDEBAR.flatMap((sec) =>
							sec.items
								.filter(
									(i) =>
										!HERO_CARDS.some((c) => c.slug === i.slug) &&
										i.slug !== "docs",
								)
								.map((it) => (
									<Link
										key={it.slug}
										href={`/${it.slug}`}
										className={`doc-index-pill${it.stub ? " stub" : ""}`}
									>
										{it.title}
										{it.stub && <span className="doc-stub">soon</span>}
									</Link>
								)),
						)}
					</div>
				</div>
			</main>
		</div>
	)
}
