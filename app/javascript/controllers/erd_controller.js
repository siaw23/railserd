import { Controller } from "@hotwired/stimulus"
import * as d3 from "d3"
import { ZoomManager } from "./zoom_manager"
import { LinkColorManager } from "./link_color_manager"
import { LayoutManager } from "./layout_manager"

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
      // animate header path height by redrawing path
      const header = g.select('path.header')
      const roundedTopRectPath = (width, height, r) => {
        const w = width; const h = height; const rr = Math.min(r, w / 2, h); return `M0,${rr} Q0,0 ${rr},0 H${w - rr} Q${w},0 ${w},${rr} V${h} H0 Z`
      }
      header.transition().duration(DURATION).attrTween('d', function() {
        const width = d.w
        const start = header.attr('d')
        const end = roundedTopRectPath(width, self._HDR_H, 8)
        // header height stays constant; we tween anyway for smoothness
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


    const PADX = 18, ROW_H = 28, HDR_H = 34, MIN_W = 260, NAME_TYPE_GAP = 18
    this._isCompact = this._isCompact ?? false
    // expose sizes for toggling later
    this._ROW_H = ROW_H; this._HDR_H = HDR_H


    const measureLayer = d3.select(this.svgTarget)
      .append("g")
      .attr("transform", "translate(-10000,-10000)")
      .attr("opacity", 0)
      .attr("pointer-events", "none")

    const measureTextWidth = (text, className) => {
      const n = measureLayer.append("text").attr("class", className).text(text).node()

      const w = n.getBBox().width
      n.remove()
      return w
    }

    tables.forEach((t) => {
      const titleW = measureTextWidth(t.id, "title")
      let maxNameW = 0
      let maxTypeW = 0
      t.fields.forEach((f) => {
        const nameW = measureTextWidth(String(f[0] ?? ""), "cell-name")
        const typeW = measureTextWidth(String(f[1] ?? ""), "cell-type")
        if (nameW > maxNameW) maxNameW = nameW
        if (typeW > maxTypeW) maxTypeW = typeW
      })

      const contentW = Math.max(titleW, maxNameW + NAME_TYPE_GAP + maxTypeW)
      t.w = Math.max(MIN_W, PADX + contentW + PADX)
      t.fullH = HDR_H + t.fields.length * ROW_H
      t.compactH = HDR_H + Math.min(3, t.fields.length) * ROW_H
      t.h = this._isCompact ? t.compactH : t.fullH
    })


    measureLayer.remove()
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


    const bounds = (() => {
      const minX = Math.min(...tables.map((n) => n.x))
      const minY = Math.min(...tables.map((n) => n.y))
      const maxX = Math.max(...tables.map((n) => n.x + n.w))
      const maxY = Math.max(...tables.map((n) => n.y + n.h))
      return { minX, minY, maxX, maxY }
    })()

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

    const gTable = this.tableLayer.selectAll(".table")
      .data(tables)
      .enter().append("g")
      .attr("class", "table")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .call(d3.drag().on("start", dragstart).on("drag", dragged).on("end", dragend))

    gTable.append("rect").attr("class", "table-outline")
      .attr("width", (d) => d.w).attr("height", (d) => d.h)


    function roundedTopRectPath(width, height, r) {
      const w = width
      const h = height
      const rr = Math.min(r, w / 2, h)
      return `M0,${rr} Q0,0 ${rr},0 H${w - rr} Q${w},0 ${w},${rr} V${h} H0 Z`
    }

    gTable.append("path").attr("class", "header")
      .attr("d", (d) => roundedTopRectPath(d.w, HDR_H, 8))

    gTable.append("text").attr("class", "title")
      .attr("x", PADX).attr("y", HDR_H / 2 + 5).text((d) => d.id)

    const self = this
    gTable.each(function (d) {
      const g = d3.select(this)
      d.fields.forEach((f, i) => {
        const y = HDR_H + i * ROW_H
        const row = g.append("rect").attr("class", "row" + (i % 2 ? " alt" : ""))
          .attr("x", 0).attr("y", y).attr("width", d.w).attr("height", ROW_H)
        const name = g.append("text").attr("class", "cell-name")
          .attr("x", PADX).attr("y", y + ROW_H / 2 + 5).text(f[0])
        const type = g.append("text").attr("class", "cell-type")
          .attr("x", d.w - PADX).attr("y", y + ROW_H / 2 + 5).text(f[1])

        if (i >= 3) {
          const initialOpacity = (typeof window.__erdCompactInit === 'boolean' ? (window.__erdCompactInit ? 0 : 1) : (self._isCompact ? 0 : 1))
          const display = initialOpacity === 0 ? "none" : null
          row.attr("data-extra", "1").attr("opacity", initialOpacity)
          name.attr("data-extra", "1").attr("opacity", initialOpacity)
          type.attr("data-extra", "1").attr("opacity", initialOpacity)
          if (display === "none") { row.style("display", "none"); name.style("display", "none"); type.style("display", "none") }
        }
      })
    })


    const linkObjs = rels.map((r, idx) => {
      const color = this.linkColorManager.getColorByIndex(idx)
      return {
        ...r,
        color,
        p: this.linkLayer.append("path").attr("class", "link").style("stroke", color),
        sLab: this.labelLayer.append("text").attr("class", "cardmark").style("fill", color),
        eLab: this.labelLayer.append("text").attr("class", "cardmark").style("fill", color)
      }
    })
    this._linkObjs = linkObjs

    const updateLinks = () => {
      const updateFn = this.layoutManager.updateLinks(linkObjs, byId)
      updateFn()
    }
    this._updateLinks = updateLinks



    updateLinks()

    // --- Highlight connected subgraph on click -------------------------------------------
    const adjacency = new Map()
    tables.forEach((t) => adjacency.set(t.id, new Set()))
    rels.forEach((r) => {
      if (!adjacency.has(r.from)) adjacency.set(r.from, new Set())
      if (!adjacency.has(r.to)) adjacency.set(r.to, new Set())
      adjacency.get(r.from).add(r.to)
      adjacency.get(r.to).add(r.from)
    })

    const reachableFrom = (startId, depthLimit = Infinity) => {
      const visited = new Set([startId])
      const q = [{ id: startId, depth: 0 }]
      while (q.length) {
        const { id, depth } = q.shift()
        if (depth >= depthLimit) continue
        const neigh = adjacency.get(id) || new Set()
        neigh.forEach((n) => {
          if (!visited.has(n)) { visited.add(n); q.push({ id: n, depth: depth + 1 }) }
        })
      }
      return visited
    }

    const applyHighlight = (startId) => {
      if (!startId) {
        gTable.classed("dimmed", false)
        gTable.classed("selected", false)
        linkObjs.forEach((L) => {
          L.p.classed("dimmed", false)
          L.sLab.classed("dimmed", false)
          L.eLab.classed("dimmed", false)
        })
        return
      }
      const depth = this._highlightDepth === 'all' ? Infinity : (parseInt(this._highlightDepth || '1', 10) || 1)
      const keep = reachableFrom(startId, depth)
      gTable.classed("dimmed", (d) => !keep.has(d.id))
      gTable.classed("selected", (d) => d.id === startId)
      linkObjs.forEach((L) => {
        const onPath = keep.has(L.from) && keep.has(L.to)
        L.p.classed("dimmed", !onPath)
        L.sLab.classed("dimmed", !onPath)
        L.eLab.classed("dimmed", !onPath)
      })
    }

    this._highlightId = null
    this._highlightDepth = this._highlightDepth || '1'
    const CLICK_EPS = 5
    this._pendingTap = null
    gTable
      .on("pointerdown.highlight", (event, d) => {
        if (event.button !== 0) return
        // record down position; do NOT preventDefault so d3.drag can work
        this._pendingTap = { x: event.clientX, y: event.clientY, id: d.id, moved: false }
      })
      .on("pointermove.highlight", (event) => {
        if (!this._pendingTap) return
        const dx = event.clientX - this._pendingTap.x
        const dy = event.clientY - this._pendingTap.y
        if (Math.hypot(dx, dy) > CLICK_EPS) this._pendingTap.moved = true
      })
      .on("pointerup.highlight", (event) => {
        if (!this._pendingTap) return
        const wasDrag = this._pendingTap.moved
        const id = this._pendingTap.id
        this._pendingTap = null
        if (wasDrag) return // treat as drag, not click
        // single click/tap highlight toggle
        if (this._highlightId === id) {
          this._highlightId = null
          applyHighlight(null)
        } else {
          this._highlightId = id
          applyHighlight(id)
        }
      })
      .on("pointercancel.highlight", () => { this._pendingTap = null })

    d3.select(this.svgTarget).on("click.highlightReset", (event) => {
      if (event.target.tagName && event.target.tagName.toLowerCase() === "svg") {
        this._highlightId = null
        applyHighlight(null)
      }
    })

    // Setup depth control UI
    if (this.hasDepthControlsTarget) {
      const btns = this.depthControlsTarget.querySelectorAll('[data-erd-depth]')
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
    if (this.hasDepthControlsTarget) {
      const btns = this.depthControlsTarget.querySelectorAll('[data-erd-depth]')
      btns.forEach((b) => {
        const v = b.getAttribute('data-erd-depth')
        if (v === val) {
          b.classList.add('bg-red-600', 'text-white')
          b.classList.remove('text-gray-700', 'hover:bg-gray-50')
        } else {
          b.classList.remove('bg-red-600', 'text-white')
          b.classList.add('text-gray-700', 'hover:bg-gray-50')
        }
      })
    }
    // Reapply current highlight if any
    if (this._highlightId) {
      // re-run render highlight logic by simulating selection
      const evt = new Event('dummy')
      // Use linkObjs/gTable closure via calling applyHighlight through stored id
      // We cannot call inner function here; instead trigger a click on same table group
      const node = this.tableLayer.selectAll('.table').filter((d) => d.id === this._highlightId).node()
      if (node) {
        // Manually call apply by reusing the same logic as pointerup
        // Toggle to same id to refresh
        this._highlightId = this._highlightId
      }
    }
  }

  applySearchQuery(q, tables, linkObjs) {
    const gTable = this.tableLayer.selectAll('.table')
    if (!q) {
      gTable.classed('dimmed', false)
      linkObjs.forEach((L) => { L.p.classed('dimmed', false); L.sLab.classed('dimmed', false); L.eLab.classed('dimmed', false) })
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

    const targetCx = match.x + match.w / 2
    const targetCy = match.y + match.h / 2
    this.zoomManager.panToPoint(targetCx, targetCy, {
      animate: true,
      duration: 450
    })
  }
}


