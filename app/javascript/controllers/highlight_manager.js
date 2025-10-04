import * as d3 from "d3"
import { OFFSETS, CSS } from "./constants"

export class HighlightManager {
  constructor(svgElement) {
    this.svgElement = svgElement
    this._highlightId = null
    this._highlightDepth = '1'
    this._pendingTap = null
    this.cleanupHandlers = []
  }

  setup(tables, linkObjects, tableSelection, depthControlsElement = null) {
    this.tables = tables
    this.linkObjects = linkObjects
    this.tableSelection = tableSelection
    this.depthControlsElement = depthControlsElement

    // Build adjacency for reachable calculation
    const adjacencyMap = new Map()
    tables.forEach((table) => adjacencyMap.set(table.id, new Set()))
    const relations = linkObjects.map((link) => ({ from: link.from, to: link.to }))
    relations.forEach((rel) => {
      if (!adjacencyMap.has(rel.from)) adjacencyMap.set(rel.from, new Set())
      if (!adjacencyMap.has(rel.to)) adjacencyMap.set(rel.to, new Set())
      adjacencyMap.get(rel.from).add(rel.to)
      adjacencyMap.get(rel.to).add(rel.from)
    })
    this.adjacencyMap = adjacencyMap

    // UI state init
    this._highlightId = null
    this._highlightDepth = this._highlightDepth || '1'

    // Attach interactions
    this._attachPointerHandlers()
    this._attachSvgReset()
    this._syncDepthButtons()
  }

  destroy() {
    this.cleanupHandlers.forEach((fn) => { try { fn() } catch {} })
    this.cleanupHandlers = []
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
    if (!this.depthControlsElement) return
    const buttons = this.depthControlsElement.querySelectorAll('[data-erd-depth]')
    buttons.forEach((button) => {
      const depthVal = button.getAttribute('data-erd-depth')
      if ((this._highlightDepth || '1') === depthVal) {
        CSS.depthActive.forEach((c) => button.classList.add(c))
        CSS.depthInactive.forEach((c) => button.classList.remove(c))
      } else {
        CSS.depthActive.forEach((c) => button.classList.remove(c))
        CSS.depthInactive.forEach((c) => button.classList.add(c))
      }
    })
  }

  _reachableFrom(startId) {
    const depthLimit = this._highlightDepth === 'all' ? Infinity : (parseInt(this._highlightDepth || '1', 10) || 1)
    const visitedIds = new Set([startId])
    const queue = [{ id: startId, depth: 0 }]
    while (queue.length) {
      const { id, depth } = queue.shift()
      if (depth >= depthLimit) continue
      const neighbors = this.adjacencyMap.get(id) || new Set()
      neighbors.forEach((neighborId) => {
        if (!visitedIds.has(neighborId)) { visitedIds.add(neighborId); queue.push({ id: neighborId, depth: depth + 1 }) }
      })
    }
    return visitedIds
  }

  _applyHighlight(startId) {
    if (!startId) {
      this.tableSelection.classed("dimmed", false)
      this.tableSelection.classed("selected", false)
      this.linkObjects.forEach((link) => {
        link.p.classed("dimmed", false)
        link.sLab.classed("dimmed", false)
        link.eLab.classed("dimmed", false)
      })
      return
    }
    const keep = this._reachableFrom(startId)
    this.tableSelection.classed("dimmed", (d) => !keep.has(d.id))
    this.tableSelection.classed("selected", (d) => d.id === startId)
    this.linkObjects.forEach((link) => {
      const onPath = keep.has(link.from) && keep.has(link.to)
      link.p.classed("dimmed", !onPath)
      link.sLab.classed("dimmed", !onPath)
      link.eLab.classed("dimmed", !onPath)
    })
  }

  _attachPointerHandlers() {
    const CLICK_MOVE_THRESHOLD_PX = OFFSETS.clickMoveThresholdPx
    this._pendingTap = null

    const handlePointerDown = (event, d) => {
      if (event.button !== 0) return
      this._pendingTap = { x: event.clientX, y: event.clientY, id: d.id, moved: false }
    }
    const handlePointerMove = (event) => {
      if (!this._pendingTap) return
      const dx = event.clientX - this._pendingTap.x
      const dy = event.clientY - this._pendingTap.y
      if (Math.hypot(dx, dy) > CLICK_MOVE_THRESHOLD_PX) this._pendingTap.moved = true
    }
    const handlePointerUp = (event) => {
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
    const handlePointerCancel = () => { this._pendingTap = null }

    this.tableSelection
      .on("pointerdown.highlight", handlePointerDown)
      .on("pointermove.highlight", handlePointerMove)
      .on("pointerup.highlight", handlePointerUp)
      .on("pointercancel.highlight", handlePointerCancel)

    this.cleanupHandlers.push(() => {
      this.tableSelection
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
    this.cleanupHandlers.push(() => d3.select(this.svgElement).on("click.highlightReset", null))
  }
}


