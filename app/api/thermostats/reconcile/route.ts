import { NextResponse } from "next/server"
import { reconcileAll } from "@/lib/thermostat/reconcile"

async function run(dryRun: boolean) {
  try {
    const results = await reconcileAll(dryRun)
    const totalActions = results.reduce((n, r) => n + r.actions.length, 0)
    const totalErrors  = results.reduce((n, r) => n + r.errors.length,  0)
    return NextResponse.json({ ok: true, properties: results.length, totalActions, totalErrors, results })
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
  return run(false)
}

// Manual trigger / preview — SYNC_SECRET, optional ?dry=true
export async function POST(request: Request) {
  const secret = process.env.SYNC_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  const url     = new URL(request.url)
  const dryRun  = url.searchParams.get("dry") === "true"
  return run(dryRun)
}
