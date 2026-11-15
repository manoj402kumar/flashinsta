"use client"

import React, { useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Check,
  Plus,
  Loader2,
  LifeBuoy,
  LogOut,
  Settings as SettingsIcon,
  Shield,
  ExternalLink,
  Mail,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatIdentityHandle } from "@/lib/identity"
import { ThemeToggle } from "@/components/theme-toggle"
import type { LinkedAccount } from "@/lib/types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const NAV = [
  { href: "/dashboard", label: "Home", icon: "/icons/home.svg" },
  { href: "/dashboard/automations", label: "Auto replies", icon: "/icons/journal.svg" },
  { href: "/dashboard/inbox", label: "Conversations", icon: "/icons/chat.svg" },
  { href: "/dashboard/analytics", label: "Insights", icon: "/icons/analytics.svg" },
]

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  username?: string
  email?: string | null
  profilePic?: string | null
  onLogout?: () => void
  onNavigate?: () => void
  collapsed?: boolean
  onToggle?: () => void
  isIgConnected?: boolean
  igUsername?: string | null
  accounts?: LinkedAccount[]
  onSwitchAccount?: (targetUserId: string) => Promise<boolean> | void
  isSwitchingAccount?: boolean
  onAddAccount?: () => void
}

export function Sidebar({
  className,
  username = "creator",
  email,
  profilePic,
  onLogout,
  onNavigate,
  collapsed = false,
  onToggle,
  isIgConnected,
  igUsername,
  accounts,
  onSwitchAccount,
  isSwitchingAccount,
  onAddAccount,
  ...props
}: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryString = searchParams?.toString() ? `?${searchParams.toString()}` : ""

  const displayName = (isIgConnected && igUsername ? igUsername : username)?.trim() || "account"
  const displayHandle = formatIdentityHandle(displayName, "account")
  const displayPic = profilePic

  const itemClass = (active: boolean) => cn(
    "relative flex h-10 items-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    collapsed ? "justify-center px-0" : "gap-3 px-3",
    active ? "bg-sidebar-accent text-sidebar-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
  )

  return (
    <aside className={cn("flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground", className)} {...props}>
      <div className={cn("flex h-16 items-center border-b border-sidebar-border", collapsed ? "justify-center" : "px-3")}>
        <Link href={`/dashboard${queryString}`} onClick={onNavigate} aria-label="flash-insta home" className={cn("flex items-center gap-2.5 rounded-lg", !collapsed && "px-2")}>
          <img
            src="/logo.svg"
            alt="flash-insta logo"
            className="size-8 shrink-0 rounded-lg object-contain"
          />
          {!collapsed && <span className="text-sm font-semibold tracking-tight">flash-insta</span>}
        </Link>
        {!collapsed && onToggle && (
          <button
            onClick={onToggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
      </div>

      {collapsed && onToggle && (
        <div className="px-3 pt-3">
          <button
            onClick={onToggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="flex size-10 w-full items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}

      {/* Main Navigation List */}
      <nav className="flex-1 space-y-1 px-3 py-3" aria-label="Dashboard navigation">
        {NAV.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={`${item.href}${queryString}`}
              prefetch={true}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
              className={itemClass(active)}
            >
              <img
                src={item.icon}
                alt=""
                className={cn("size-4 shrink-0 dark:invert", active && item.href === "/dashboard" && "dark:invert-0")}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}

        <div className="my-2.5 h-px bg-sidebar-border" />

        <a
          href={isIgConnected && (igUsername || username) ? `https://www.instagram.com/${(igUsername || username).replace(/^@/, '')}/` : "https://help.instagram.com"}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={collapsed ? "Help and support" : undefined}
          title={collapsed ? "Help and support" : undefined}
          className={cn(itemClass(false), "mt-1")}
        >
          <LifeBuoy className="size-4 shrink-0" />
          {!collapsed && <span>Help and support</span>}
        </a>
      </nav>

      {/* Bottom Area: Appearance & Instagram-style Account Switcher */}
      <div className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="text-xs text-muted-foreground">Appearance</span>
            <ThemeToggle className="h-7 w-14" />
          </div>
        )}

        {/* Instagram Account Switcher Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Switch account or manage profile"
              className={cn(
                "w-full flex items-center rounded-xl bg-sidebar-accent/80 hover:bg-sidebar-accent transition-all p-2 text-left cursor-pointer border border-transparent hover:border-sidebar-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group",
                collapsed ? "justify-center" : "gap-2.5"
              )}
            >
              <div className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground border border-sidebar-border shadow-xs">
                {displayPic ? (
                  <img
                    src={displayPic}
                    alt={displayHandle}
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    className="size-full object-cover"
                  />
                ) : (
                  (displayName || "I").charAt(0).toUpperCase()
                )}
                {isIgConnected && (
                  <span className="absolute bottom-0 right-0 size-2 rounded-full bg-emerald-500 ring-2 ring-sidebar" />
                )}
              </div>

              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground group-hover:text-foreground">
                      {displayHandle}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={cn(
                          "size-1.5 rounded-full shrink-0",
                          isIgConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                        )}
                      />
                      <p className="truncate text-[11px] text-muted-foreground" title={email || undefined}>
                        {email || (isIgConnected ? "Instagram Connected" : "Not Connected")}
                      </p>
                    </div>
                  </div>
                  <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align={collapsed ? "center" : "start"}
            side="top"
            sideOffset={10}
            className="w-64 p-1.5 shadow-2xl rounded-2xl border border-border bg-popover text-popover-foreground backdrop-blur-md z-50"
          >
            {/* Master Email Header */}
            {email && (
              <div className="px-3 py-2 border-b border-border/70 mb-1">
                <span className="text-[10px] font-bold font-mono-ui uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Mail className="size-3 text-primary shrink-0" />
                  Signed In Email
                </span>
                <p className="text-xs font-semibold text-foreground truncate mt-0.5" title={email}>
                  {email}
                </p>
              </div>
            )}

            {/* Header: Switch Accounts */}
            <div className="px-3 py-1.5 border-b border-border/70 mb-1 flex items-center justify-between">
              <span className="text-[10px] font-bold font-mono-ui uppercase tracking-wider text-muted-foreground">
                Connected Accounts
              </span>
              {accounts && accounts.length > 1 && (
                <span className="text-[10px] font-mono-ui font-semibold px-1.5 py-0.5 rounded-full bg-secondary text-foreground">
                  {accounts.length}
                </span>
              )}
            </div>

            {/* List of Accounts */}
            <div className="max-h-60 overflow-y-auto space-y-0.5 py-0.5">
              {accounts && accounts.length > 0 ? (
                accounts.map((acc) => {
                  const isCurrent = acc.isActive
                  return (
                    <button
                      key={acc.userId}
                      type="button"
                      disabled={isSwitchingAccount}
                      onClick={() => {
                        if (!isCurrent && onSwitchAccount) {
                          void onSwitchAccount(acc.userId)
                        }
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer",
                        isCurrent
                          ? "bg-secondary/90 font-medium text-foreground cursor-default"
                          : "hover:bg-accent/70 text-muted-foreground hover:text-foreground active:scale-[0.99]"
                      )}
                    >
                      <div className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sidebar-primary text-[11px] font-bold text-sidebar-primary-foreground border border-sidebar-border">
                        {acc.profilePic ? (
                          <img
                            src={acc.profilePic}
                            alt={acc.username}
                            referrerPolicy="no-referrer"
                            crossOrigin="anonymous"
                            className="size-full object-cover"
                          />
                        ) : (
                          (acc.username || "A").charAt(0).toUpperCase()
                        )}
                        {acc.isIgConnected && (
                          <span className="absolute bottom-0 right-0 size-1.5 rounded-full bg-emerald-500 ring-1 ring-background" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground">
                          {formatIdentityHandle(acc.username, "Account")}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {acc.isIgConnected ? "Instagram Connected" : "Workspace"}
                        </p>
                      </div>

                      {isCurrent ? (
                        <Check className="size-4 text-emerald-500 shrink-0" />
                      ) : isSwitchingAccount ? (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />
                      ) : null}
                    </button>
                  )
                })
              ) : (
                <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-secondary/80">
                  <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sidebar-primary text-[11px] font-bold text-sidebar-primary-foreground border border-sidebar-border">
                    {displayPic ? (
                      <img src={displayPic} alt={displayHandle} className="size-full object-cover" />
                    ) : (
                      displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{displayHandle}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {isIgConnected ? "Instagram Connected" : "Workspace"}
                    </p>
                  </div>
                  <Check className="size-4 text-emerald-500 shrink-0" />
                </div>
              )}
            </div>

            {/* Add Instagram Account Button */}
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem
              onClick={onAddAccount}
              className="cursor-pointer rounded-xl px-2.5 py-2 text-xs font-medium flex items-center gap-2.5 text-foreground hover:bg-accent/60"
            >
              <div className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Plus className="size-3.5" />
              </div>
              <span className="font-semibold">Add Instagram Account</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1" />

            {/* Settings & Info */}
            <DropdownMenuItem asChild className="cursor-pointer rounded-xl px-2.5 py-2 text-xs font-medium">
              <Link href={`/dashboard/settings${queryString}`} prefetch={true} onClick={onNavigate} className="flex items-center gap-2.5 w-full">
                <SettingsIcon className="size-4 text-muted-foreground" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild className="cursor-pointer rounded-xl px-2.5 py-2 text-xs font-medium">
              <Link href="/privacy" target="_blank" className="flex items-center gap-2.5 w-full">
                <Shield className="size-4 text-muted-foreground" />
                <span>Privacy and Security</span>
                <ExternalLink className="size-3 text-muted-foreground ml-auto opacity-70" />
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1" />

            {/* Logout Entire Email Access */}
            <DropdownMenuItem
              onClick={onLogout}
              variant="destructive"
              className="cursor-pointer rounded-xl px-2.5 py-2 text-xs font-medium flex items-center gap-2.5 text-destructive focus:bg-destructive/10"
            >
              <LogOut className="size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {email ? `Log out (${email})` : `Log out of workspace`}
                </span>
                <span className="block text-[10px] opacity-75 truncate">
                  Ends session for this email & connected accounts
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}
