import type { Metadata, Viewport } from "next"
import { Grain } from "@/components/site/grain"
import { PALETTE_INIT } from "@/lib/palette"
import "./globals.css"

export const metadata: Metadata = {
	title: "Smaran, स्मरण: memory for voice agents",
	description:
		"Self-hosted memory for voice agents. Stores what the caller meant after they correct themselves, keeps the history of every fact, and recalls in English, Hindi and Hinglish.",
}

export const viewport: Viewport = {
	viewportFit: "cover",
	themeColor: "#1636c9",
}

export default function RootLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, first-party palette bootstrap */}
				<script dangerouslySetInnerHTML={{ __html: PALETTE_INIT }} />
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link
					rel="preconnect"
					href="https://fonts.gstatic.com"
					crossOrigin=""
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=Anek+Devanagari:wdth,wght@75..125,300..800&family=Anek+Latin:wdth,wght@75..125,300..800&family=IBM+Plex+Mono:wght@400;500&display=swap"
					rel="stylesheet"
				/>
			</head>
			<body>
				<Grain />
				{children}
			</body>
		</html>
	)
}
