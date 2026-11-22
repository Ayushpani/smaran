import Link from "next/link"
import { FootGiant } from "./foot-giant"
import { PaletteSwitch } from "./palette-switch"

export function SiteFooter() {
	return (
		<footer className="site-foot tone-hero" data-tone="hero">
			<div className="wrap">
				<div className="foot-grid">
					<div>
						<Link className="wordmark" href="/">
							smaran{" "}
							<span className="deva" lang="hi">
								स्मरण
							</span>
						</Link>
						<p className="foot-note">
							Memory for voice agents. Open source under MIT, self-hosted on
							your own Postgres.
						</p>
					</div>
					<div>
						<h3>Product</h3>
						<ul>
							<li>
								<Link href="/#architecture">How it works</Link>
							</li>
							<li>
								<Link href="/#features">Features</Link>
							</li>
							<li>
								<Link href="/#integrations">Integrations</Link>
							</li>
							<li>
								<Link href="/#numbers">Benchmarks</Link>
							</li>
							<li>
								<Link href="/signup">Get a key</Link>
							</li>
							<li>
								<Link href="/console">Console</Link>
							</li>
						</ul>
					</div>
					<div>
						<h3>Docs</h3>
						<ul>
							<li>
								<Link href="/docs/quickstart">Quickstart</Link>
							</li>
							<li>
								<Link href="/docs/voice">Voice concepts</Link>
							</li>
							<li>
								<Link href="/docs/api">REST API</Link>
							</li>
							<li>
								<Link href="/docs/self-host">Self-host</Link>
							</li>
						</ul>
					</div>
					<div>
						<h3>Project</h3>
						<ul>
							<li>
								<a href="https://github.com/Ayushpani/smaran">GitHub</a>
							</li>
							<li>
								<a href="https://github.com/Ayushpani/smaran/blob/main/RESULTS.md">
									Results
								</a>
							</li>
							<li>
								<Link href="/docs/dpdp">DPDP and data</Link>
							</li>
						</ul>
					</div>
				</div>
				<FootGiant />
				<div className="foot-base">
					<span>
						Smaran, <span lang="hi">स्मरण</span>, is Hindi and Sanskrit for
						remembrance.
					</span>
					<PaletteSwitch wide />
				</div>
			</div>
		</footer>
	)
}
