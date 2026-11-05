"use client"

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Menu } from "lucide-react"
import { Sidebar } from "@/components/layout/sidebar"
import { useState } from "react"
import type { LinkedAccount } from "@/lib/types"

export interface MobileNavProps {
    username?: string
    email?: string | null
    profilePic?: string | null
    onLogout?: () => void
    isIgConnected?: boolean
    igUsername?: string | null
    accounts?: LinkedAccount[]
    onSwitchAccount?: (targetUserId: string) => Promise<boolean> | void
    isSwitchingAccount?: boolean
    onAddAccount?: () => void
}

export function MobileNav({
    username,
    email,
    profilePic,
    onLogout,
    isIgConnected,
    igUsername,
    accounts,
    onSwitchAccount,
    isSwitchingAccount,
    onAddAccount,
}: MobileNavProps) {
    const [open, setOpen] = useState(false)

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-6 w-6" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 border-r border-sidebar-border bg-sidebar w-72">
                <Sidebar
                    className="h-full border-none bg-transparent"
                    username={username}
                    email={email}
                    profilePic={profilePic}
                    onLogout={onLogout}
                    onNavigate={() => setOpen(false)}
                    isIgConnected={isIgConnected}
                    igUsername={igUsername}
                    accounts={accounts}
                    onSwitchAccount={async (targetId) => {
                        if (onSwitchAccount) {
                            const res = await onSwitchAccount(targetId)
                            setOpen(false)
                            return res ?? false
                        }
                        return false
                    }}
                    isSwitchingAccount={isSwitchingAccount}
                    onAddAccount={() => {
                        setOpen(false)
                        onAddAccount?.()
                    }}
                />
            </SheetContent>
        </Sheet>
    )
}
