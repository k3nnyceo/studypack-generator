// The Pack library (/api/shared, server/shared.js): ready-made packs anyone
// can browse; signed-in students add a few a day to their own library, and can
// share packs from it.

async function sharedApi(method, { id, body } = {}) {
  let res
  try {
    res = await fetch(`/api/shared${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw new Error('Couldn’t reach StarterPack. Check your connection and try again.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) {
    const err = new Error(data?.error || `Something went wrong (${res.status}). Please try again.`)
    err.status = res.status
    // The daily allowance: why and when it refills (like generation limits).
    err.reason = data?.reason
    err.resetsAt = data?.resetsAt
    throw err
  }
  return data
}

// { packs: [{ id, title, course, topic, fingerprint, modules, verified, mine, sharedAt }],
//   allowance: { plan, used, limit, resetsAt } | null, canModerate }
export const listShared = () => sharedApi('GET')

// { entry: { …summary, guide }, allowance }; uses one of today's adds.
export const fetchShared = (id) => sharedApi('GET', { id })

// { pack, alreadyShared? }
export const sharePack = (entry) => sharedApi('POST', { body: { action: 'share', entry: { guide: entry.guide } } })

export const removeShared = (id) => sharedApi('POST', { body: { action: 'remove', id } })
