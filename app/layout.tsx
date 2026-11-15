import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import { ThemeProvider } from "@/components/theme-provider"

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://insta-p8-fawn.vercel.app")

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "flash-insta — Instagram Automation for Creators & Brands",
    template: "%s | flash-insta",
  },
  description:
    "Turn Instagram comments and DMs into viral growth and sales. Automated replies, story triggers, and conversion funnels powered 100% by official Meta Graph API.",
  applicationName: "flash-insta",
  authors: [{ name: "flash-insta" }],
  creator: "flash-insta",
  publisher: "flash-insta",
  keywords: [
    "flash-insta",
    "Instagram automation",
    "Instagram DM automation",
    "auto reply comments",
    "Instagram story automation",
    "Meta Graph API",
    "lead generation",
    "Instagram marketing",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "flash-insta",
    title: "flash-insta — Instagram Automation for Creators & Brands",
    description:
      "Turn Instagram comments and DMs into viral growth and sales. Automated replies, story triggers, and conversion funnels powered 100% by official Meta Graph API.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "flash-insta — Instagram Automation for Creators & Brands",
        type: "image/png",
      },
      {
        url: "/logo-square.png",
        width: 512,
        height: 512,
        alt: "flash-insta brand logo",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "flash-insta — Instagram Automation for Creators & Brands",
    description:
      "Turn Instagram comments and DMs into viral growth and sales. Automated replies, story triggers, and conversion funnels powered 100% by official Meta Graph API.",
    images: ["/og-image.png"],
    creator: "@flashinsta",
  },
  icons: {
    icon: [
      {
        url: "/logo.svg",
        type: "image/svg+xml",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
      {
        url: "/favicon.ico",
        type: "image/x-icon",
      },
      {
        url: "/logo.jpg",
        type: "image/jpeg",
      },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
}

const themeBootstrap = `
(function() {
  try {
    var stored = window.localStorage.getItem('flash-insta-theme');
    var resolved = (stored === 'dark') ? 'dark' : 'light';
    var root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
    root.dataset.theme = resolved;
  } catch (_) { /* noop */ }
})();
`.trim()

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Pre-hydration theme bootstrap — prevents flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <link rel="image_src" href={`${siteUrl}/og-image.png`} />
        <meta property="og:image:secure_url" content={`${siteUrl}/og-image.png`} />
      </head>
      <body className={`font-sans antialiased bg-background text-foreground`} suppressHydrationWarning>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Analytics />
        <Toaster />
      </body>
    </html>
  )
}
