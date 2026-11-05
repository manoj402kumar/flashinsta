import Link from "next/link"
import { Shield, ArrowLeft, Mail, Lock, CheckCircle2, FileText, Scale } from "lucide-react"

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-5 sm:px-8 lg:px-12">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="space-y-4">
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-1.5 text-xs font-mono-ui text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to Workspace Settings
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono-ui font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <Shield className="size-3.5" />
                  Verified Privacy Standards
                </span>
                <span className="text-xs text-muted-foreground font-mono-ui">Digital Data Protection</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Privacy Policy & Data Notice</h1>
              <p className="text-xs text-muted-foreground mt-1 font-mono-ui">
                Effective Date: October 2026 · Version 2.5 · Data Controller: ayuuxh labs
              </p>
            </div>

            <Link
              href="/dashboard/settings"
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground text-xs font-mono-ui font-bold px-4 py-2.5 hover:bg-primary/90 transition-colors w-fit"
            >
              <Lock className="size-3.5" />
              Manage Settings
            </Link>
          </div>
        </div>

        {/* Executive Summary Cards */}
        <div className="grid gap-3 sm:grid-cols-3 text-xs font-mono-ui">
          <div className="p-4 rounded-xl bg-card border border-border space-y-1">
            <span className="text-muted-foreground block text-[11px]">Lawful Purpose</span>
            <span className="font-bold text-foreground block">Requested Instagram Automation</span>
            <span className="text-muted-foreground block text-[11px] pt-1">User-directed automation</span>
          </div>

          <div className="p-4 rounded-xl bg-card border border-border space-y-1">
            <span className="text-muted-foreground block text-[11px]">LLM Training Policy</span>
            <span className="font-bold text-emerald-400 block">Zero Model Training</span>
            <span className="text-muted-foreground block text-[11px] pt-1">Stateless API completions</span>
          </div>

          <div className="p-4 rounded-xl bg-card border border-border space-y-1">
            <span className="text-muted-foreground block text-[11px]">Your Control</span>
            <span className="font-bold text-foreground block">Access, Export & Erasure</span>
            <span className="text-muted-foreground block text-[11px] pt-1">Directly in Dashboard</span>
          </div>
        </div>

        {/* Main Content Sections */}
        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          {/* Section 1 */}
          <section className="space-y-3 bg-card p-6 rounded-2xl border border-border">
            <h2 className="text-base font-bold text-foreground font-mono-ui flex items-center gap-2">
              <span className="text-primary font-mono">1.</span> Notice & Grounds for Processing
            </h2>
            <p>
              This Privacy Notice is issued by <strong>flash-insta</strong> (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). It applies to creators, businesses, and users utilizing the <strong>flash-insta</strong> automation platform.
            </p>
            <p>
              We collect and process digital personal data solely on the basis of your <strong>unambiguous, informed consent</strong>, for the specific purpose of automating customer engagement on your Instagram business accounts.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3 bg-card p-6 rounded-2xl border border-border">
            <h2 className="text-base font-bold text-foreground font-mono-ui flex items-center gap-2">
              <span className="text-primary font-mono">2.</span> Categories of Personal Data Collected
            </h2>
            <ul className="list-disc pl-5 space-y-2 text-xs">
              <li>
                <strong className="text-foreground">Authentication & Identification Data:</strong> Instagram User IDs, page IDs, encrypted User/Page Access Tokens, and linked Google identity metadata (name, email address, profile picture).
              </li>
              <li>
                <strong className="text-foreground">Business & Knowledge Profile Data:</strong> Brand names, service descriptions, hours, location, FAQ answers, and custom instructions provided by you to train the auto-responder.
              </li>
              <li>
                <strong className="text-foreground">Communication & Interaction Telemetry:</strong> Inbound comment text, DM conversations received via Meta webhooks, timestamps, sender handles, and delivery statuses necessary to verify automation performance.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3 bg-card p-6 rounded-2xl border border-border">
            <h2 className="text-base font-bold text-foreground font-mono-ui flex items-center gap-2">
              <span className="text-primary font-mono">3.</span> Authorized Sub-Processors
            </h2>
            <p className="text-xs">
              To deliver automation services, we engage reputable third-party Data Processors under strict confidentiality and security terms:
            </p>
            <div className="grid gap-3 sm:grid-cols-3 pt-2 text-xs font-mono-ui">
              <div className="p-3.5 rounded-xl bg-background border border-border space-y-1">
                <span className="font-bold text-foreground block">Meta Platforms, Inc.</span>
                <span className="text-muted-foreground block text-[11px]">Instagram Graph API</span>
                <span className="text-emerald-400 block text-[11px]">Webhook & Message Relay</span>
              </div>
              <div className="p-3.5 rounded-xl bg-background border border-border space-y-1">
                <span className="font-bold text-foreground block">Groq Cloud / OpenAI</span>
                <span className="text-muted-foreground block text-[11px]">LLM Inference</span>
                <span className="text-emerald-400 block text-[11px]">Zero Training Retention</span>
              </div>
              <div className="p-3.5 rounded-xl bg-background border border-border space-y-1">
                <span className="font-bold text-foreground block">Supabase Inc.</span>
                <span className="text-muted-foreground block text-[11px]">PostgreSQL Database</span>
                <span className="text-emerald-400 block text-[11px]">AES-256 Cloud Encryption</span>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3 bg-card p-6 rounded-2xl border border-border">
            <h2 className="text-base font-bold text-foreground font-mono-ui flex items-center gap-2">
              <span className="text-primary font-mono">4.</span> Your Rights & Controls
            </h2>
            <p className="text-xs">
              You enjoy full control over your personal data that you may exercise directly from your dashboard:
            </p>
            <div className="space-y-2.5 pt-1 text-xs">
              <div className="p-3 rounded-xl bg-background border border-border">
                <strong className="text-foreground">Right to Access Information:</strong> You can request and download a complete, machine-readable JSON archive of all personal data held about you at any time.
              </div>
              <div className="p-3 rounded-xl bg-background border border-border">
                <strong className="text-foreground">Right to Correction & Erasure:</strong> You have the right to update inaccurate business knowledge or permanently delete your stored tokens, message logs, and automation history.
              </div>
              <div className="p-3 rounded-xl bg-background border border-border">
                <strong className="text-foreground">Right to Withdraw Consent:</strong> You can manage or revoke automation permissions at any time through your workspace settings.
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="space-y-3 bg-card p-6 rounded-2xl border border-border">
            <h2 className="text-base font-bold text-foreground font-mono-ui flex items-center gap-2">
              <span className="text-primary font-mono">5.</span> Data Retention & Automated Disposal
            </h2>
            <p className="text-xs">
              Personal data is retained only for the duration necessary to satisfy the automation purpose for which it was collected:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>Conversation and message telemetry logs are retained for a rolling maximum of 30 days before being automatically purged.</li>
              <li>Instagram Access Tokens and API credentials are wiped immediately upon account disconnection or upon triggering data erasure.</li>
              <li>Zero raw AI prompt or user message logs are retained by our third-party LLM inference providers.</li>
            </ul>
          </section>

          {/* Section 6 - Contact */}
          <section className="space-y-3 bg-card p-6 rounded-2xl border border-border">
            <h2 className="text-base font-bold text-foreground font-mono-ui flex items-center gap-2">
              <span className="text-primary font-mono">6.</span> Privacy Support & Contact
            </h2>
            <p className="text-xs">
              If you have any inquiries, complaints, or wish to dispute data handling, contact our designated privacy officer:
            </p>
            <div className="p-4 rounded-xl bg-background border border-border space-y-2 text-xs font-mono-ui">
              <div>
                <span className="text-muted-foreground">Designation: </span>
                <span className="text-foreground font-bold">Privacy & Support Officer</span>
              </div>
              <div>
                <span className="text-muted-foreground">Entity: </span>
                <span className="text-foreground">flash-insta Operations</span>
              </div>
              <div>
                <span className="text-muted-foreground">Official Email: </span>
                <a href="mailto:y.manoj623246@gmail.com" className="text-primary font-bold hover:underline">
                  y.manoj623246@gmail.com
                </a>
              </div>
              <div>
                <span className="text-muted-foreground">Response Timeline: </span>
                <span className="text-foreground font-bold">Prompt response within 48 business hours</span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between text-xs font-mono-ui text-muted-foreground gap-3">
          <span>&copy; {new Date().getFullYear()} flash-insta. All rights reserved.</span>
          <Link href="/dashboard/settings" className="text-primary hover:underline font-semibold">
            Workspace Settings
          </Link>
        </div>
      </div>
    </div>
  )
}
