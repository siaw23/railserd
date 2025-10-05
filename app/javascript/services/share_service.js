import pako from "pako"

function base64url(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function encodeGraphSnapshot(graph, schema) {
  const snapshot = { graph, schema: schema || '' }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(snapshot))
  const deflated = pako.deflateRaw(jsonBytes, { level: 9 })
  return base64url(deflated)
}

export async function createShortGraphLink(graph, csrfToken, schema) {
  const payload = encodeGraphSnapshot(graph, schema)
  const res = await fetch('/erd/shorten', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ payload })
  })
  if (!res.ok) throw new Error('shorten failed')
  const j = await res.json()
  return j.url
}
