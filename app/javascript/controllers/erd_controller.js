import { Controller } from "@hotwired/stimulus"
import * as d3 from "d3"
import { ZoomManager } from "./zoom_manager"
import { LinkColorManager } from "./link_color_manager"
import { LayoutManager } from "./layout_manager"
import { HighlightManager } from "./highlight_manager"
import { DEFAULT_GEOMETRY, createSvgTextMeasurer, applyTableDimensions, computeBoundsFromTables } from "./geometry"
import { TableRenderer } from "./table_renderer"
import { LinkRenderer } from "./link_renderer"
import pako from "pako"
import { createShortGraphLink, createShortSchemaLink } from "../services/share_service"
import { PaneManager } from "./pane_manager"
import { CompactionManager } from "./compaction_manager"
import { SearchManager } from "./search_manager"
import { CanvasManager } from "./canvas_manager"
import { ParseService } from "../services/parse_service"
import { fitToViewport } from "./viewport_fit"

export default class extends Controller {
  static targets = ["input", "svg", "emptyState", "leftPane", "rightPane", "toggleButton", "panelLeftIcon", "panelRightIcon", "depthControls", "searchInput", "compactButton", "toast"]
  static values = { initialGraph: String }

  connect() {
    this.pane = new PaneManager(this)
    this.compaction = new CompactionManager(this)
    this.search = new SearchManager(this)
    this.parser = new ParseService()

    this.root = null
    this.linkLayer = null
    this.labelLayer = null
    this.tableLayer = null

    this.zoomManager = new ZoomManager(this.svgTarget, d3.select(this.svgTarget).append("g"), { minScale: 0.2, maxScale: 3 })
    this.linkColorManager = new LinkColorManager()
    this.layoutManager = new LayoutManager()

    this.canvas = new CanvasManager(this)
    this.canvas.initialize()

    this._debounceTimer = null

    const saved = window.localStorage.getItem("erd:leftPane:collapsed")
    if (saved === "true") {
      this.pane.collapse(true)
    }

    this.showEmptyState()

    const serverGraphJson = (this.hasInitialGraphValue && this.initialGraphValue) ? this.initialGraphValue : ""
    if (serverGraphJson && serverGraphJson.trim() !== ""
    ) {
      try {
        const graph = JSON.parse(serverGraphJson)
        this.resetCanvas()
        this.render(graph)
        this.pane.expand(true)
        return
      } catch (_) {}
    }

    const url = new URL(window.location.href)
    const sParam = url.searchParams.get("s")
    if (sParam) {
      try {
        const graph = this.decodeCompressedGraph(sParam)
        if (graph) {
          this.resetCanvas()
          this.render(graph)
          this.pane.expand(true)
          return
        }
      } catch (_) {}
    }
  }

  zoomBy(factor) { this.zoomManager.zoomBy(factor) }
  zoomIn() { this.zoomManager.zoomIn() }
  zoomOut() { this.zoomManager.zoomOut() }

  debouncedParse() {
    clearTimeout(this._debounceTimer)
    this._debounceTimer = setTimeout(() => this.parse(), 250)
  }

  async parse() {
    try {
      const schema = this.inputTarget.value
      if (!schema.trim()) {
        this.clear(true)
        return
      }

      const result = await this.parser.parseSchema(schema)
      if (result.cancelled) return

      if (!result.ok) {
        console.error("Parse error", result.data)
        this.clear(true)
        return
      }

      this.resetCanvas()
      this.render(result.data)
    } catch (err) {
      console.error("Unexpected error during parse/render", err)
      this.clear(true)
    }
  }

  csrfToken() {
    const el = document.querySelector('meta[name="csrf-token"]')
    return el ? el.getAttribute('content') : ''
  }

  // --- Sharing ---
  shareGraph = async () => {
    try {
      const graph = this.captureCurrentGraph()
      const url = await createShortGraphLink(graph, this.csrfToken())
      this.copyLink(url)
    } catch (e) {
      console.error('Failed to share graph', e)
      alert('Failed to generate share link.')
    }
  }

  shareSchema = async () => {
    const schema = this.hasInputTarget ? this.inputTarget.value : ''
    if (!schema || !schema.trim()) {
      alert('No schema to share. Please add your schema first.')
      return
    }
    try {
      const url = await createShortSchemaLink(schema, this.csrfToken())
      this.copyLink(url)
    } catch (e) {
      console.error('Failed to generate schema link', e)
      alert('Failed to generate schema share link.')
    }
  }

  copyLink(url) {
    navigator.clipboard.writeText(url).then(() => {
      this.showToast()
    }).catch(() => {
      //  show URL in prompt for manual copy
      prompt('Copy this URL to share:', url)
    })
  }

  showToast() {
    if (!this.hasToastTarget) return
    const toast = this.toastTarget

    // Slide in
    toast.style.transform = 'translateX(0)'

    // Slide out
    setTimeout(() => {
      toast.style.transform = 'translateX(120%)'
    }, 3000)
  }

  decodeCompressedGraph(payload) {
    const bin = this.base64urlToBytes(payload)
    const inflated = pako.inflateRaw(bin)
    const json = new TextDecoder().decode(inflated)
    return JSON.parse(json)
  }

  base64urlToBytes(s) {
    const replaced = s.replace(/-/g, '+').replace(/_/g, '/')
    const pad = replaced.length % 4 === 0 ? 0 : 4 - (replaced.length % 4)
    const withPad = replaced + '='.repeat(pad)
    const binary = atob(withPad)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  }

  captureCurrentGraph() {
    // Use current tables and links already rendered
    const nodes = (this._tables || []).map(t => ({ id: t.id, fields: t.fields, x: t.x, y: t.y }))
    const links = (this._linkObjs || []).map(L => ({ from: L.from, to: L.to, fromCard: L.fromCard, toCard: L.toCard }))
    return { nodes, links }
  }

  toggleCompactTables() {
    this.compaction.toggle()
  }

  clear(showEmpty = true) {
    this.linkLayer.selectAll("*").remove()
    this.labelLayer.selectAll("*").remove()
    this.tableLayer.selectAll("*").remove()
    if (showEmpty) this.showEmptyState(); else this.hideEmptyState()
  }

  resetCanvas() { this.canvas.reset() }

  showEmptyState() {
    if (this.hasEmptyStateTarget) {
      this.emptyStateTarget.style.display = "flex"
    }
  }

  hideEmptyState() {
    if (this.hasEmptyStateTarget) {
      this.emptyStateTarget.style.display = "none"
    }
  }

  togglePane() { this.pane.toggle() }
  collapsePane(immediate = false) { this.pane.collapse(immediate) }
  expandPane(immediate = false) { this.pane.expand(immediate) }
  updateToggleIcons(collapsed) { this.pane.updateIcons(collapsed) }

  render(graph) {
    const tables = graph.nodes.map((n, i) => ({
      id: n.id,
      fields: n.fields,
      x: typeof n.x === "number" ? n.x : (150 + (i % 3) * 300),
      y: typeof n.y === "number" ? n.y : (100 + Math.floor(i / 3) * 250)
    }))
    const rels = graph.links

    if (tables.length === 0) {
      this.clear(true)
      return
    }

    this.hideEmptyState()

    const isCompact = this.compaction ? this.compaction.isCompact : false
    const measurer = createSvgTextMeasurer(this.svgTarget)
    const { PADX, ROW_H, HDR_H } = applyTableDimensions(
      tables,
      measurer.measureTextWidth,
      DEFAULT_GEOMETRY,
      isCompact
    )
    this._ROW_H = ROW_H; this._HDR_H = HDR_H
    measurer.destroy()
    const byId = Object.fromEntries(tables.map((t) => [t.id, t]))
    this._byId = byId
    this._tables = tables

    this._tableByLowerId = Object.fromEntries(tables.map((t) => [String(t.id).toLowerCase(), t]))

    const hasServerPositions = tables.every((t) => typeof t.x === "number" && typeof t.y === "number")
    if (!hasServerPositions) {
      this.layoutManager.applyForceLayout(tables, rels, byId)
    }

    if (!tables.every((t) => typeof t.x === "number" && typeof t.y === "number")) {
      this.layoutManager.resolveOverlaps(tables, 28, 200)
    }

    const bounds = computeBoundsFromTables(tables)

    requestAnimationFrame(() => fitToViewport(this.zoomManager, bounds, this.hasDepthControlsTarget ? this.depthControlsTarget : null))

    this.clear(false)

    function dragstart(event, d) { d3.select(this).raise() }
    let rafPending = false
    const self = this
    function dragged(event, d) {
      d.x = event.x; d.y = event.y
      d3.select(this).attr("transform", `translate(${d.x},${d.y})`)
      if (!rafPending) {
        rafPending = true
        requestAnimationFrame(() => { rafPending = false; if (self._updateLinks) self._updateLinks() })
      }
    }
    function dragend(event, d) {
      gTable.attr("transform", (dd) => `translate(${dd.x},${dd.y})`)
      if (self._updateLinks) self._updateLinks()
    }

    const tableRenderer = new TableRenderer()
    const gTable = tableRenderer.render(this.tableLayer, tables, { PADX, ROW_H, HDR_H })
      .call(d3.drag().on("start", dragstart).on("drag", dragged).on("end", dragend))

    const linkRenderer = new LinkRenderer(this.layoutManager)
    const { linkObjs, update } = linkRenderer.render(
      this.linkLayer,
      this.labelLayer,
      rels,
      (idx) => this.linkColorManager.getColorByIndex(idx),
      byId
    )
    this._linkObjs = linkObjs
    this._updateLinks = update

    update()

    this.highlightManager?.destroy()
    this.highlightManager = new HighlightManager(this.svgTarget, this.tableLayer)
    this.highlightManager._highlightDepth = this._highlightDepth || '1'
    this.highlightManager.setup(tables, linkObjs, gTable, this.hasDepthControlsTarget ? this.depthControlsTarget : null)

    if (this.hasSearchInputTarget) {
      this.searchInputTarget.addEventListener('input', (e) => {
        const q = (e.target.value || '').trim().toLowerCase()
        clearTimeout(this._searchTimer)
        this._searchTimer = setTimeout(() => {
          this.applySearchQuery(q, tables, linkObjs)
        }, 220)
      })
    }
  }

  onSearchInput(event) {
    this.search.onInput(event)
  }

  setDepth(event) {
    const btn = event.currentTarget
    const val = btn.getAttribute('data-erd-depth') || '1'
    this._highlightDepth = val
    this.highlightManager?.setDepth(val)
  }
}


