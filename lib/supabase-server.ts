import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Create a Supabase server client
 * Use this in API routes and server actions
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies()
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("[supabase-server] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }

  return createServerClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: {
      getAll: async () => cookieStore.getAll(),
      setAll: async (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch (error) {
          console.error("[supabase-server] Error setting cookies:", error)
        }
      },
    },
  })
}
