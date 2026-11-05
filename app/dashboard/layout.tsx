"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { MobileNav } from "@/components/layout/mobile-nav"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { ConnectInstagramModal } from "@/components/dashboard/ConnectInstagramModal"
import { Loader2 } from "lucide-react"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const router = useRouter()
    const {
        userId,
        username,
        email,
        profilePic,
        logout,
        isLoading,
        isIgConnected,
        igUsername,
        accounts,
        switchAccount,
        isSwitchingAccount,
        fetchAccounts,
    } = useInstagramSession()
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [showAddAccountModal, setShowAddAccountModal] = useState(false)

    useEffect(() => {
        setMounted(true)
        setSidebarCollapsed(localStorage.getItem("flash-insta-sidebar") === "collapsed")
    }, [])

    // Strict client-side route guard: Never render dashboard if unauthenticated
    useEffect(() => {
        if (!isLoading && !userId) {
            router.replace("/?auth=login")
        }
    }, [isLoading, userId, router])

    const toggleSidebar = () => {
        setSidebarCollapsed(value => {
            const next = !value
            localStorage.setItem("flash-insta-sidebar", next ? "collapsed" : "expanded")
            return next
        })
    }

    if (!mounted || isLoading || !userId) {
        return (
            <div className="flex h-screen items-center justify-center bg-background text-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="flex min-h-screen bg-background text-foreground">
            {/* Desktop Sidebar */}
            <div className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 z-50 transition-[width] duration-200 ${sidebarCollapsed ? "md:w-[72px]" : "md:w-64"}`}>
                <Sidebar
                    className="h-full border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
                    username={isIgConnected && igUsername ? igUsername : (username || "Account")}
                    email={email || undefined}
                    profilePic={isIgConnected ? (profilePic || null) : profilePic}
                    onLogout={logout}
                    collapsed={sidebarCollapsed}
                    onToggle={toggleSidebar}
                    isIgConnected={isIgConnected}
                    igUsername={igUsername || undefined}
                    accounts={accounts}
                    onSwitchAccount={switchAccount}
                    isSwitchingAccount={isSwitchingAccount}
                    onAddAccount={() => setShowAddAccountModal(true)}
                />
            </div>

            {/* Main Content Area */}
            <div className={`flex-1 flex flex-col transition-[padding] duration-200 ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-64"}`}>
                {/* Mobile Header (Visible only on small screens) */}
                <header className="md:hidden h-16 border-b border-border bg-background flex items-center justify-between px-4 sticky top-0 z-40">
                    <span className="font-serif-display text-xl text-foreground">flash-insta</span>
                    <MobileNav
                        username={isIgConnected && igUsername ? igUsername : (username || "Account")}
                        email={email || undefined}
                        profilePic={isIgConnected ? (profilePic || null) : profilePic}
                        onLogout={logout}
                        isIgConnected={isIgConnected}
                        igUsername={igUsername || undefined}
                        accounts={accounts}
                        onSwitchAccount={switchAccount}
                        isSwitchingAccount={isSwitchingAccount}
                        onAddAccount={() => setShowAddAccountModal(true)}
                    />
                </header>

                <main className="dashboard-canvas flex-1 relative overflow-auto">
                    {children}
                </main>
            </div>

            {/* Modal for Adding Another Instagram Account */}
            <ConnectInstagramModal
                open={showAddAccountModal}
                onOpenChange={setShowAddAccountModal}
                userId={userId}
                asNewAccount={true}
                onConnected={() => {
                    void fetchAccounts()
                    router.refresh()
                }}
            />
        </div>
    )
}
