import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Admin Central — flash-insta",
  description: "High-observability command center and fleet manager for flash-insta Instagram automation platform",
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans antialiased">
      {children}
    </div>
  )
}
