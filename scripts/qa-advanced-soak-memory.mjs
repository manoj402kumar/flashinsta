import test from "node:test"
import assert from "node:assert/strict"
import v8 from "node:v8"

import { sanitizeLogData } from "../lib/logger.ts"

test("Soak & Memory Profiling: 20,000 continuous operations without unbounded heap growth", () => {
  // Rate limiter map with cleanup
  const memoryStore = new Map()
  function checkRateLimit(ip, limit = 60, windowMs = 60000, now = Date.now()) {
    const key = `auth:${ip}`
    const record = memoryStore.get(key)
    if (!record || record.resetTime <= now) {
      memoryStore.set(key, { count: 1, resetTime: now + windowMs })
      return true
    }
    record.count++
    return record.count <= limit
  }

  // Baseline heap
  if (global.gc) global.gc()
  const initialHeap = process.memoryUsage().heapUsed

  const ITERATIONS = 20000
  let currentTime = 1000000000000

  for (let i = 0; i < ITERATIONS; i++) {
    const ip = `10.0.${i % 50}.${i % 255}`
    // Advance time periodically to trigger window expirations
    if (i % 200 === 0) {
      currentTime += 65000
      // Evict expired entries (mirroring interval cleanup)
      for (const [k, v] of memoryStore.entries()) {
        if (v.resetTime <= currentTime) memoryStore.delete(k)
      }
    }
    checkRateLimit(ip, 60, 60000, currentTime)

    // Run logger sanitization
    sanitizeLogData({
      iteration: i,
      access_token: `EAAB_${i}_secret_token_data`,
      meta: { nestedKey: "safe", token: `subtok_${i}` },
    })
  }

  if (global.gc) global.gc()
  const finalHeap = process.memoryUsage().heapUsed
  const heapGrowthBytes = finalHeap - initialHeap
  const heapGrowthMB = heapGrowthBytes / (1024 * 1024)

  // Verify that memory store size is bounded
  assert.ok(memoryStore.size <= 200, `Memory store size (${memoryStore.size}) must remain bounded`)

  // Heap growth over 20,000 complex operations should remain under 25MB
  assert.ok(
    heapGrowthMB < 25,
    `Heap growth of ${heapGrowthMB.toFixed(2)}MB exceeds 25MB threshold`
  )
})
