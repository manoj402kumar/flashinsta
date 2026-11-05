import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import { ThemeProvider } from "@/components/theme-provider"

export const metadata: Metadata = {
  title: "flash-insta — Instagram Automation",
  description: "Auto-reply to comments, DMs, and stories with keyword triggers.",
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
