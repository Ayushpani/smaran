import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
	title: "Smaran · स्मरण — memory for voice agents",
	description:
		"Voice-native memory layer for AI agents. Self-correcting, ~15ms semantic recall on CPU, Hindi + English out of the box.",
}

export default function RootLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<html lang="en">
			<head>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link
					rel="preconnect"
					href="https://fonts.gstatic.com"
					crossOrigin=""
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=Young+Serif&family=Newsreader:ital,opsz,wght@0,6..72,300..500;1,6..72,300..500&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Rozha+One&family=Tiro+Devanagari+Sanskrit&display=swap"
					rel="stylesheet"
				/>
			</head>
			<body>{children}</body>
		</html>
	)
}
