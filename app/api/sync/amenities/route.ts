import { NextResponse } from "next/server"
import { runAmenitiesSync } from "@/lib/sync/amenities"

async function runSync() {
  try {
    const result = await runAmenitiesSync()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Vercel cron sends GET with Authorization: Bearer ${CRON_SECRET}
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  return runSync()
}

// Manual trigger uses SYNC_SECRET
export async function POST(request: Request) {
  const secret = process.env.SYNC_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  return runSync()
}
