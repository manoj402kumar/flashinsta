import { NextResponse } from "next/server"

/**
 * Test login endpoint is disabled in production to eliminate security backdoors
 * and adhere to security hardening guidelines.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Endpoint not found or disabled in production" },
    { status: 404 }
  )
}

export async function GET() {
  return NextResponse.json(
    { error: "Endpoint not found or disabled in production" },
    { status: 404 }
  )
}
