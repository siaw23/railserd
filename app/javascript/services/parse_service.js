export class ParseService {
  constructor() {
    this._lastRequestId = 0
  }

  csrfToken() {
    const el = document.querySelector('meta[name="csrf-token"]')
    return el ? el.getAttribute('content') : ''
  }

  async parseSchema(schema) {
    const requestId = ++this._lastRequestId
    const res = await fetch('/erd/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': this.csrfToken()
      },
      body: JSON.stringify({ schema })
    })
    const data = await res.json().catch(() => ({}))

    if (requestId !== this._lastRequestId) {
      return { cancelled: true, ok: false, data: {} }
    }

    return { cancelled: false, ok: res.ok, data }
  }
}
