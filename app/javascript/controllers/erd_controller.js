import { Controller } from "@hotwired/stimulus"
import * as d3 from "d3"
import { ZoomManager } from "./zoom_manager"
import { LinkColorManager } from "./link_color_manager"
import { LayoutManager } from "./layout_manager"
import { HighlightManager } from "./highlight_manager"
import { DEFAULT_GEOMETRY, createSvgTextMeasurer, applyTableDimensions, computeBoundsFromTables } from "./geometry"
import { TableRenderer } from "./table_renderer"
import { LinkRenderer } from "./link_renderer"

export default class extends Controller {
  static targets = ["input", "svg", "emptyState", "leftPane", "rightPane", "toggleButton", "panelLeftIcon", "panelRightIcon", "depthControls", "searchInput", "compactButton"]

  connect() {
    this.root = d3.select(this.svgTarget).append("g")
    this.linkLayer = this.root.append("g")
    this.labelLayer = this.root.append("g")
    this.tableLayer = this.root.append("g")

    this.zoomManager = new ZoomManager(this.svgTarget, this.root, {
      minScale: 0.2,
      maxScale: 3
    })

    this.linkColorManager = new LinkColorManager()
    this.layoutManager = new LayoutManager()

    const container = this.svgTarget.parentElement
    if (container) {
      const multiplier = 1
      const canW = Math.max(1, container.clientWidth * multiplier)
      const canH = Math.max(1, container.clientHeight * multiplier)
      this.canvasWidth = canW
      this.canvasHeight = canH
      const svgSel = d3.select(this.svgTarget)
      svgSel.attr("viewBox", `0 0 ${canW} ${canH}`)
      svgSel.attr("width", canW).attr("height", canH)
      container.scrollLeft = Math.max(0, (canW - container.clientWidth) / 2)
      container.scrollTop = Math.max(0, (canH - container.clientHeight) / 2)
    }

    this._debounceTimer = null


    this._lastRequestId = 0


    const saved = window.localStorage.getItem("erd:leftPane:collapsed")
    if (saved === "true") {
      this.collapsePane(true)
    }

    // Ensure empty state shows on initial load before any parsing
    this.showEmptyState()
  }


  zoomBy(factor) {
    this.zoomManager.zoomBy(factor)
  }

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

      const requestId = ++this._lastRequestId
      const res = await fetch("/erd/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": this.csrfToken() },
        body: JSON.stringify({ schema })
      })
      const data = await res.json().catch(() => ({}))


      if (requestId !== this._lastRequestId) return

      if (!res.ok) {
        console.error("Parse error", data)
        this.clear(true)
        return
      }


      this.resetCanvas()
      this.render(data)
    } catch (err) {
      console.error("Unexpected error during parse/render", err)
      this.clear(true)
    }
  }

  csrfToken() {
    const el = document.querySelector('meta[name="csrf-token"]')
    return el ? el.getAttribute('content') : ''
  }

  toggleCompactTables() {
    this._isCompact = !this._isCompact
    if (this.hasCompactButtonTarget) {
      const btn = this.compactButtonTarget
      btn.classList.toggle('bg-red-600', this._isCompact)
      btn.classList.toggle('text-white', this._isCompact)
      btn.classList.toggle('text-gray-700', !this._isCompact)
      btn.classList.toggle('hover:bg-gray-50', !this._isCompact)
      btn.classList.toggle('hover:bg-red-700', this._isCompact)
    }
    const gTable = this.tableLayer.selectAll('.table')
    const DURATION = 260
    const self = this
    gTable.each(function(d) {
      const g = d3.select(this)
      const extras = g.selectAll('[data-extra="1"]')
      const outline = g.select('rect.table-outline')
      const rowsCount = d.fields.length
      const fullHeight = d.fullH
      const compactHeight = d.compactH
      const targetHeight = self._isCompact ? compactHeight : fullHeight
      // animate outline height and keep links in sync by updating d.h during tween
      const startHeight = typeof d.h === 'number' ? d.h : +outline.attr('height') || fullHeight
      const trans = outline.transition().duration(DURATION).attr('height', targetHeight)
      trans.tween('relink', function() {
        let rafPending = false
        return function(t) {
          d.h = startHeight + (targetHeight - startHeight) * t
          if (!rafPending) {
            rafPending = true
            requestAnimationFrame(() => {
              rafPending = false
              if (self._updateLinks) self._updateLinks()
            })
          }
        }
      }).on('end', function() {
        d.h = targetHeight
        if (self._updateLinks) self._updateLinks()
      })
      const header = g.select('path.header')
      const roundedTopRectPath = (width, height, r) => {
        const w = width; const h = height; const rr = Math.min(r, w / 2, h); return `M0,${rr} Q0,0 ${rr},0 H${w - rr} Q${w},0 ${w},${rr} V${h} H0 Z`
      }
      header.transition().duration(DURATION).attrTween('d', function() {
        const width = d.w
        const start = header.attr('d')
        const end = roundedTopRectPath(width, self._HDR_H, 8)
        return () => end
      })

      if (extras.empty()) return
      if (self._isCompact) {
        extras.transition().duration(DURATION).attr('opacity', 0).on('end', function() { d3.select(this).style('display', 'none') })
      } else {
        extras.style('display', null).transition().duration(DURATION).attr('opacity', 1)
      }
    })

    // After batch resizing kicked off, perform a final reflow
    if (this._updateLinks) this._updateLinks()
  }

  clear(showEmpty = true) {
    this.linkLayer.selectAll("*").remove()
    this.labelLayer.selectAll("*").remove()
    this.tableLayer.selectAll("*").remove()
    if (showEmpty) this.showEmptyState(); else this.hideEmptyState()
  }


  resetCanvas() {
    const svgSel = d3.select(this.svgTarget)
    svgSel.selectAll("*").remove()
    this.root = svgSel.append("g")
    this.linkLayer = this.root.append("g")
    this.labelLayer = this.root.append("g")
    this.tableLayer = this.root.append("g")
    if (this.zoomManager) {
      this.zoomManager = new ZoomManager(this.svgTarget, this.root, {
        minScale: 0.2,
        maxScale: 3
      })
    }
    if (this.linkColorManager) {
      this.linkColorManager.reset()
    }
    if (this.layoutManager) {
      this.layoutManager = new LayoutManager()
    }
  }

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


  togglePane() {
    const isCollapsed = this.leftPaneTarget.classList.contains('collapsed')
    if (isCollapsed) {
      this.expandPane()
    } else {
      this.collapsePane()
    }
  }

  collapsePane(immediate = false) {
    if (!this.hasLeftPaneTarget) return

    const leftPane = this.leftPaneTarget
    const rightPane = this.rightPaneTarget
    const toggleBtn = this.hasToggleButtonTarget ? this.toggleButtonTarget : null


    leftPane.classList.add('collapsed')


    if (immediate) {
      leftPane.style.transition = 'none'
      if (rightPane) rightPane.style.transition = 'none'
    } else {

      if (!leftPane.style.transition || leftPane.style.transition === 'none') {
        leftPane.style.transition = 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)'
      }
      if (rightPane && (!rightPane.style.transition || rightPane.style.transition === 'none')) {
        rightPane.style.transition = 'margin-left 300ms cubic-bezier(0.4, 0, 0.2, 1)'
      }
    }

    void leftPane.offsetWidth // reflow to ensure transition triggers
    leftPane.style.transform = 'translate3d(-100%, 0, 0)'

    if (rightPane) {
      const leftPaneWidth = leftPane.offsetWidth
      rightPane.style.marginLeft = `-${leftPaneWidth}px`
    }


    this.updateToggleIcons(true)
    if (toggleBtn) toggleBtn.classList.add('collapsed')


    window.localStorage.setItem("erd:leftPane:collapsed", "true")


    if (immediate) {
      setTimeout(() => {
        leftPane.style.transition = ''
        if (rightPane) rightPane.style.transition = ''
      }, 50)
    }
  }

  expandPane() {
    if (!this.hasLeftPaneTarget) return

    const leftPane = this.leftPaneTarget
    const rightPane = this.rightPaneTarget
    const toggleBtn = this.hasToggleButtonTarget ? this.toggleButtonTarget : null


    leftPane.classList.remove('collapsed')


    if (!leftPane.style.transition || leftPane.style.transition === 'none') {
      leftPane.style.transition = 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)'
    }
    void leftPane.offsetWidth
    leftPane.style.transform = 'translate3d(0, 0, 0)'


    if (rightPane) {
      if (!rightPane.style.transition || rightPane.style.transition === 'none') {
        rightPane.style.transition = 'margin-left 300ms cubic-bezier(0.4, 0, 0.2, 1)'
      }
      rightPane.style.marginLeft = '0'
    }


    this.updateToggleIcons(false)
    if (toggleBtn) toggleBtn.classList.remove('collapsed')


    window.localStorage.setItem("erd:leftPane:collapsed", "false")
  }

  updateToggleIcons(collapsed) {
    if (this.hasPanelLeftIconTarget && this.hasPanelRightIconTarget) {
      if (collapsed) {

        this.panelLeftIconTarget.classList.add('hidden')
        this.panelRightIconTarget.classList.remove('hidden')
      } else {

        this.panelLeftIconTarget.classList.remove('hidden')
        this.panelRightIconTarget.classList.add('hidden')
      }
    }
  }

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


    this._isCompact = this._isCompact ?? false
    const measurer = createSvgTextMeasurer(this.svgTarget)
    const { PADX, ROW_H, HDR_H } = applyTableDimensions(
      tables,
      measurer.measureTextWidth,
      DEFAULT_GEOMETRY,
      this._isCompact
    )
    // expose sizes for toggling later
    this._ROW_H = ROW_H; this._HDR_H = HDR_H
    measurer.destroy()
    const byId = Object.fromEntries(tables.map((t) => [t.id, t]))
    this._byId = byId
    this._tables = tables

    // Build quick lookup for search by lowercase id
    this._tableByLowerId = Object.fromEntries(tables.map((t) => [String(t.id).toLowerCase(), t]))

    // Apply layout if needed
    const hasServerPositions = tables.every((t) => typeof t.x === "number" && typeof t.y === "number")
    if (!hasServerPositions) {
      this.layoutManager.applyForceLayout(tables, rels, byId)
    }

    // Resolve any overlaps
    if (!tables.every((t) => typeof t.x === "number" && typeof t.y === "number")) {
      this.layoutManager.resolveOverlaps(tables, 28, 200)
    }


    const bounds = computeBoundsFromTables(tables)

    const fitToViewport = () => {
      const reservedBottom = this.hasDepthControlsTarget ? (this.depthControlsTarget.offsetHeight + 24) : 0
      this.zoomManager.fitToViewport(bounds, {
        padding: 40,
        reservedBottom,
        animate: false
      })
    }
    requestAnimationFrame(fitToViewport)


    this.clear(false)


    function dragstart(event, d) { d3.select(this).raise() }
    let rafPending = false
    function dragged(event, d) {
      d.x = event.x; d.y = event.y
      d3.select(this).attr("transform", `translate(${d.x},${d.y})`)
      if (!rafPending) {
        rafPending = true
        requestAnimationFrame(() => { rafPending = false; updateLinks() })
      }
    }
    function dragend(event, d) {

      gTable.attr("transform", (dd) => `translate(${dd.x},${dd.y})`)
      updateLinks()
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
    const updateLinks = update
    this._linkObjs = linkObjs
    this._updateLinks = updateLinks

    updateLinks()

    // --- Highlight connected subgraph on click -------------------------------------------
    this.highlightManager?.destroy()
    this.highlightManager = new HighlightManager(this.svgTarget, this.tableLayer)
    this.highlightManager._highlightDepth = this._highlightDepth || '1'
    this.highlightManager.setup(tables, linkObjs, gTable, this.hasDepthControlsTarget ? this.depthControlsTarget : null)

    // Hook up search box if present
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

  setDepth(event) {
    const btn = event.currentTarget
    const val = btn.getAttribute('data-erd-depth') || '1'
    this._highlightDepth = val
    this.highlightManager?.setDepth(val)
  }

  applySearchQuery(q, tables, linkObjs) {
    const gTable = this.tableLayer.selectAll('.table')
    if (!q) {
      gTable.classed('dimmed', false)
      linkObjs.forEach((L) => { L.p.classed('dimmed', false); L.sLab.classed('dimmed', false); L.eLab.classed('dimmed', false) })
      if (this._searchPreviousPosition) {
        this.zoomManager.panToPoint(this._searchPreviousPosition.x, this._searchPreviousPosition.y, {
          animate: true,
          duration: 450
        })
        this._searchPreviousPosition = null
      }
      return
    }
    const match = (this._tableByLowerId || {})[q]
    if (!match) {
      gTable.classed('dimmed', true)
      linkObjs.forEach((L) => { L.p.classed('dimmed', true); L.sLab.classed('dimmed', true); L.eLab.classed('dimmed', true) })
      return
    }
    gTable.classed('dimmed', (d) => d.id !== match.id)
    linkObjs.forEach((L) => {
      const onPath = (L.from === match.id || L.to === match.id)
      L.p.classed('dimmed', !onPath)
      L.sLab.classed('dimmed', !onPath)
      L.eLab.classed('dimmed', !onPath)
    })

    if (!this._searchPreviousPosition) {
      this._searchPreviousPosition = this.zoomManager.getCurrentCenter()
    }

    const targetCx = match.x + match.w / 2
    const targetCy = match.y + match.h / 2
    this.zoomManager.panToPoint(targetCx, targetCy, {
      animate: true,
      duration: 450
    })
  }
}


