import pako from "pako"

function base64urlFromBytes(uint8) {
  let bin = ''
  for (let i = 0; i < uint8.length; i++) bin += String.fromCharCode(uint8[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function encodeCompressedGraph(graph) {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(graph))
  const deflated = pako.deflateRaw(jsonBytes, { level: 9 })
  return base64urlFromBytes(deflated)
}

export function encodeCompressedSchema(schema) {
  const bytes = new TextEncoder().encode(schema)
  const deflated = pako.deflateRaw(bytes, { level: 9 })
  return base64urlFromBytes(deflated)
}

export async function createShortGraphLink(graph, csrfToken) {
  const payload = encodeCompressedGraph(graph)
  const res = await fetch('/erd/shorten', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ payload })
  })
  if (!res.ok) throw new Error('shorten failed')
  const j = await res.json()
  return j.url
}

export async function createShortSchemaLink(schema, csrfToken) {
  const payload = encodeCompressedSchema(schema)
  const res = await fetch('/erd/shorten_schema', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ payload })
  })
  if (!res.ok) throw new Error('shorten_schema failed')
  const j = await res.json()
  return j.url
}
