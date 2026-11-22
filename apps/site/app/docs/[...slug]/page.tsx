import { notFound } from "next/navigation"
import { compileMDX } from "next-mdx-remote/rsc"
import { Sidebar } from "@/components/docs/Sidebar"
import { Toc } from "@/components/docs/Toc"
import Link from "next/link"
import { allDocSlugs, extractToc, readDoc, SIDEBAR } from "@/lib/docs"
import { useMDXComponents } from "@/mdx-components"

interface Params {
	slug: string[]
}

export async function generateStaticParams(): Promise<Params[]> {
	return allDocSlugs().map((s) => ({
		slug: s.split("/"),
	}))
}

export async function generateMetadata({
	params,
}: {
	params: Promise<Params>
}) {
	const { slug } = await params
	const doc = readDoc(`docs/${slug.join("/")}`)
	if (!doc) return {}
	return {
		title: `${doc.title} · Smaran Docs`,
		description: doc.description,
	}
}

export default async function DocPage({ params }: { params: Promise<Params> }) {
	const { slug } = await params
	const fullSlug = `docs/${slug.join("/")}`
	const doc = readDoc(fullSlug)
	if (!doc) notFound()
	const toc = extractToc(doc.body)
	const flat = SIDEBAR.flatMap((sec) => sec.items).filter((i) => !i.stub)
	const at = flat.findIndex((i) => i.slug === fullSlug)
	const prev = at > 0 ? flat[at - 1] : undefined
	const next = at >= 0 && at < flat.length - 1 ? flat[at + 1] : undefined
	// biome-ignore lint/suspicious/noExplicitAny: compileMDX's component-map
	// type is internal — cast at the boundary.
	const components = useMDXComponents({}) as any
	const { content } = await compileMDX({
		source: doc.body,
		components,
		options: { parseFrontmatter: false },
	})
	return (
		<div className="doc-shell">
			<Sidebar current={fullSlug} sections={SIDEBAR} />
			<main className="doc-main">
				<div className="doc-eyebrow">{doc.section}</div>
				<h1 className="doc-h1">{doc.title}</h1>
				{doc.description && <p className="doc-lede">{doc.description}</p>}
				<div className="doc-prose">{content}</div>
				<nav className="doc-pager" aria-label="Previous and next">
					{prev && (
						<Link href={`/${prev.slug}`}>
							<span>Previous</span>
							{prev.title}
						</Link>
					)}
					{next && (
						<Link href={`/${next.slug}`} className="next">
							<span>Next</span>
							{next.title}
						</Link>
					)}
				</nav>
			</main>
			<Toc items={toc} />
		</div>
	)
}
