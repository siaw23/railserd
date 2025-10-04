export function on(target, eventName, handler, options) {
  if (!target || !eventName || !handler) return () => {}
  target.addEventListener(eventName, handler, options)
  return () => {
    try { target.removeEventListener(eventName, handler, options) } catch {}
  }
}

export function onD3(selection, eventName, handler) {
  if (!selection || !selection.on) return () => {}
  selection.on(eventName, handler)
  return () => { try { selection.on(eventName, null) } catch {} }
}
