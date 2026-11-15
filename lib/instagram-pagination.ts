// Meta returns Instagram media in cursor-paged responses. A single request
// never represents the whole account, so callers must follow `paging.next`
// until Meta stops returning one.

export interface PaginatedFetchResult<T> {
  items: T[]
  complete: boolean
  pages: number
  error: string | null
}

export interface PaginatedFetchOptions {
  timeoutMs?: number
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
}

export async function fetchAllPages<T extends { id?: string | number }>(
  firstUrl: string,
  options: PaginatedFetchOptions = {},
): Promise<PaginatedFetchResult<T>> {
  const timeoutMs = options.timeoutMs ?? 9000
  const fetchImpl = options.fetchImpl ?? fetch

  const items: T[] = []
  const seenIds = new Set<string>()
  const seenUrls = new Set<string>()

  let url: string | null = firstUrl
  let pages = 0
  let complete = true
  let error: string | null = null

  while (url) {
    if (seenUrls.has(url)) {
      complete = false
      error = "paging loop detected"
      break
    }
    seenUrls.add(url)

    let response: Response
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
    } catch (cause) {
      complete = false
      error = `request failed: ${cause instanceof Error ? cause.message : String(cause)}`
      break
    }

    if (!response.ok) {
      complete = false
      error = `HTTP ${response.status}`
      break
    }

    const json = await response.json().catch(() => null)
    if (!json || !Array.isArray(json.data)) {
      complete = false
      error = "invalid response"
      break
    }

    for (const item of json.data as T[]) {
      const id = item?.id != null ? String(item.id) : null
      if (id) {
        if (seenIds.has(id)) continue
        seenIds.add(id)
      }
      items.push(item)
    }

    pages += 1
    const next = json.paging?.next
    url = typeof next === "string" && next.length > 0 ? next : null
  }

  return { items, complete, pages, error }
}
