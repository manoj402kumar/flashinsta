"use client"

import { useState } from "react"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { ConversationList } from "@/components/inbox/ConversationList"
import { ChatWindow } from "@/components/inbox/ChatWindow"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export default function InboxPage() {
    const { userId, isLoading } = useInstagramSession()
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
    const [selectedRecipientName, setSelectedRecipientName] = useState<string | null>(null)
    const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null)

    const handleSelect = (id: string, name: string, recipientId: string) => {
        setSelectedConversationId(id)
        setSelectedRecipientName(name)
        setSelectedRecipientId(recipientId)
    }

    if (isLoading) {
        return (
            <div className="h-[calc(100vh-3rem)] m-6 rounded-xl overflow-hidden border border-border/60 bg-card flex animate-pulse">
                <div className="w-full md:w-[360px] border-r border-border/60 p-4 space-y-4">
                    <div className="w-32 h-6 rounded bg-muted/60" />
                    <div className="w-full h-10 rounded-xl bg-muted/40" />
                    <div className="space-y-3 pt-2">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={`conv-skel-${i}`} className="flex items-center gap-3 p-2">
                                <div className="w-10 h-10 rounded-full bg-muted/60 shrink-0" />
                                <div className="space-y-2 flex-1">
                                    <div className="w-24 h-4 rounded bg-muted/60" />
                                    <div className="w-36 h-3 rounded bg-muted/30" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="hidden md:flex flex-1 items-center justify-center p-8 text-muted-foreground/40">
                    <div className="space-y-3 text-center">
                        <div className="w-16 h-16 rounded-full bg-muted/40 mx-auto" />
                        <div className="w-40 h-4 rounded bg-muted/40 mx-auto" />
                    </div>
                </div>
            </div>
        )
    }

    if (!userId) {
        return (
            <div className="p-8 text-center text-sm text-muted-foreground">
                Connect your Instagram account or log in to view your conversations.
            </div>
        )
    }

    return (
        <div className="h-[calc(100vh-3rem)] m-6 rounded-xl overflow-hidden border border-border bg-card flex relative">
            {/* Left Sidebar: Conversation List */}
            <div className={cn(
                "w-full md:w-[360px] flex-shrink-0 border-r border-border bg-card absolute md:static inset-0 z-10 transition-transform duration-200 md:translate-x-0 h-full",
                selectedConversationId ? "-translate-x-full md:translate-x-0" : "translate-x-0"
            )}>
                <ConversationList
                    userId={userId}
                    selectedId={selectedConversationId}
                    onSelect={handleSelect}
                />
            </div>

            {/* Right Main: Chat Window */}
            <div className={cn(
                "flex-1 w-full absolute md:static inset-0 z-20 bg-card transition-transform duration-200 md:translate-x-0 h-full",
                selectedConversationId ? "translate-x-0" : "translate-x-full md:translate-x-0"
            )}>
                <ChatWindow
                    conversationId={selectedConversationId}
                    recipientName={selectedRecipientName}
                    recipientId={selectedRecipientId || undefined}
                    userId={userId}
                    onBack={() => setSelectedConversationId(null)}
                />
            </div>
        </div>
    )
}
