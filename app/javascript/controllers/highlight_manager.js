import * as d3 from "d3"

export class HighlightManager {
  constructor(svgElement, tableLayerSelection) {
    this.svgElement = svgElement
    this.tableLayer = tableLayerSelection
    this._highlightId = null
    this._highlightDepth = '1'
    this._pendingTap = null
    this._cleanupFns = []
  }

  setup(tables, linkObjs, gTable, depthControlsEl = null) {
    this.tables = tables
    this.linkObjs = linkObjs
    this.gTable = gTable
    this.depthControlsEl = depthControlsEl

    // Build adjacency for reachable calculation
    const adjacency = new Map()
    tables.forEach((t) => adjacency.set(t.id, new Set()))
    const rels = linkObjs.map((L) => ({ from: L.from, to: L.to }))
    rels.forEach((r) => {
      if (!adjacency.has(r.from)) adjacency.set(r.from, new Set())
      if (!adjacency.has(r.to)) adjacency.set(r.to, new Set())
      adjacency.get(r.from).add(r.to)
      adjacency.get(r.to).add(r.from)
    })
    this._adjacency = adjacency

    // UI state init
    this._highlightId = null
    this._highlightDepth = this._highlightDepth || '1'

    // Attach interactions
    this._attachPointerHandlers()
    this._attachSvgReset()
    this._syncDepthButtons()
  }

  destroy() {
    this._cleanupFns.forEach((fn) => { try { fn() } catch {} })
    this._cleanupFns = []
  }

  setDepth(eventOrValue) {
    const val = typeof eventOrValue === 'string'
      ? eventOrValue
      : ((eventOrValue && eventOrValue.currentTarget && eventOrValue.currentTarget.getAttribute('data-erd-depth')) || '1')
    this._highlightDepth = val
    this._syncDepthButtons()
    if (this._highlightId) this._applyHighlight(this._highlightId)
  }

  _syncDepthButtons() {
    if (!this.depthControlsEl) return
    const btns = this.depthControlsEl.querySelectorAll('[data-erd-depth]')
    btns.forEach((btn) => {
      const depthVal = btn.getAttribute('data-erd-depth')
      if ((this._highlightDepth || '1') === depthVal) {
        btn.classList.add('bg-red-600', 'text-white')
        btn.classList.remove('text-gray-700', 'hover:bg-gray-50')
      } else {
        btn.classList.remove('bg-red-600', 'text-white')
        btn.classList.add('text-gray-700', 'hover:bg-gray-50')
      }
    })
  }

  _reachableFrom(startId) {
    const depthLimit = this._highlightDepth === 'all' ? Infinity : (parseInt(this._highlightDepth || '1', 10) || 1)
    const visited = new Set([startId])
    const q = [{ id: startId, depth: 0 }]
    while (q.length) {
      const { id, depth } = q.shift()
      if (depth >= depthLimit) continue
      const neigh = this._adjacency.get(id) || new Set()
      neigh.forEach((n) => {
        if (!visited.has(n)) { visited.add(n); q.push({ id: n, depth: depth + 1 }) }
      })
    }
    return visited
  }

  _applyHighlight(startId) {
    if (!startId) {
      this.gTable.classed("dimmed", false)
      this.gTable.classed("selected", false)
      this.linkObjs.forEach((L) => {
        L.p.classed("dimmed", false)
        L.sLab.classed("dimmed", false)
        L.eLab.classed("dimmed", false)
      })
      return
    }
    const keep = this._reachableFrom(startId)
    this.gTable.classed("dimmed", (d) => !keep.has(d.id))
    this.gTable.classed("selected", (d) => d.id === startId)
    this.linkObjs.forEach((L) => {
      const onPath = keep.has(L.from) && keep.has(L.to)
      L.p.classed("dimmed", !onPath)
      L.sLab.classed("dimmed", !onPath)
      L.eLab.classed("dimmed", !onPath)
    })
  }

  _attachPointerHandlers() {
    const CLICK_EPS = 5
    this._pendingTap = null

    const down = (event, d) => {
      if (event.button !== 0) return
      this._pendingTap = { x: event.clientX, y: event.clientY, id: d.id, moved: false }
    }
    const move = (event) => {
      if (!this._pendingTap) return
      const dx = event.clientX - this._pendingTap.x
      const dy = event.clientY - this._pendingTap.y
      if (Math.hypot(dx, dy) > CLICK_EPS) this._pendingTap.moved = true
    }
    const up = (event) => {
      if (!this._pendingTap) return
      const wasDrag = this._pendingTap.moved
      const id = this._pendingTap.id
      this._pendingTap = null
      if (wasDrag) return
      if (this._highlightId === id) {
        this._highlightId = null
        this._applyHighlight(null)
      } else {
        this._highlightId = id
        this._applyHighlight(id)
      }
    }
    const cancel = () => { this._pendingTap = null }

    this.gTable
      .on("pointerdown.highlight", down)
      .on("pointermove.highlight", move)
      .on("pointerup.highlight", up)
      .on("pointercancel.highlight", cancel)

    // Cleanup handler to remove listeners if needed
    this._cleanupFns.push(() => {
      this.gTable
        .on("pointerdown.highlight", null)
        .on("pointermove.highlight", null)
        .on("pointerup.highlight", null)
        .on("pointercancel.highlight", null)
    })
  }

  _attachSvgReset() {
    const handler = (event) => {
      if (event.target.tagName && event.target.tagName.toLowerCase() === "svg") {
        this._highlightId = null
        this._applyHighlight(null)
      }
    }
    d3.select(this.svgElement).on("click.highlightReset", handler)
    this._cleanupFns.push(() => d3.select(this.svgElement).on("click.highlightReset", null))
  }
}


