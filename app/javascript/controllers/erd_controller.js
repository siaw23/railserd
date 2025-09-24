import { Controller } from "@hotwired/stimulus"
import * as d3 from "d3"

// Connects to data-controller="erd"
export default class extends Controller {
  static targets = ["input", "svg", "emptyState", "leftPane", "rightPane", "toggleButton", "panelLeftIcon", "panelRightIcon"]

  connect() {
    this.root = d3.select(this.svgTarget).append("g")
    this.linkLayer = this.root.append("g")
    this.labelLayer = this.root.append("g")
    this.tableLayer = this.root.append("g")

    this.zoom = d3.zoom().scaleExtent([0.2, 3]).on("zoom", (e) => this.root.attr("transform", e.transform))
    d3.select(this.svgTarget).call(this.zoom).on("dblclick.zoom", null)

    // Initialize a large, fixed canvas (4x viewport) to avoid dynamic resizing during drag
    const container = this.svgTarget.parentElement
    if (container) {
      const multiplier = 4
      const canW = Math.max(1, container.clientWidth * multiplier)
      const canH = Math.max(1, container.clientHeight * multiplier)
      this.canvasWidth = canW
      this.canvasHeight = canH
      const svgSel = d3.select(this.svgTarget)
      svgSel.attr("viewBox", `0 0 ${canW} ${canH}`)
      svgSel.attr("width", canW).attr("height", canH)
      // Center the scroll so content added later is viewed near the middle
      container.scrollLeft = Math.max(0, (canW - container.clientWidth) / 2)
      container.scrollTop = Math.max(0, (canH - container.clientHeight) / 2)
    }

    this._debounceTimer = null

    // Restore left pane state
    const saved = window.localStorage.getItem("erd:leftPane:collapsed")
    if (saved === "true") {
      this.collapsePane(true) // immediate, no animation on load
    }
  }

  // Zoom controls
  zoomBy(factor) {
    const svgSel = d3.select(this.svgTarget)
    svgSel.transition().duration(200).call(this.zoom.scaleBy, factor)
  }

  zoomIn() { this.zoomBy(1.2) }
  zoomOut() { this.zoomBy(1 / 1.2) }

  debouncedParse() {
    clearTimeout(this._debounceTimer)
    this._debounceTimer = setTimeout(() => this.parse(), 250)
  }

  async parse() {
    const schema = this.inputTarget.value
    if (!schema.trim()) {
      this.clear(true)
      return
    }
    const res = await fetch("/erd/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": this.csrfToken() },
      body: JSON.stringify({ schema })
    })
    const data = await res.json()
    if (!res.ok) {
      console.error("Parse error", data)
      this.clear(true)
      return
    }
    this.render(data)
  }

  csrfToken() {
    const el = document.querySelector('meta[name="csrf-token"]')
    return el ? el.getAttribute('content') : ''
  }

  clear(showEmpty = true) {
    this.linkLayer.selectAll("*").remove()
    this.labelLayer.selectAll("*").remove()
    this.tableLayer.selectAll("*").remove()
    if (showEmpty) this.showEmptyState(); else this.hideEmptyState()
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

  // Sliding panel functionality
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

    // Add collapsed class for state tracking
    leftPane.classList.add('collapsed')

    // If immediate (on page load), disable transitions temporarily
    if (immediate) {
      leftPane.style.transition = 'none'
      if (rightPane) rightPane.style.transition = 'none'
    } else {
      // Make sure transitions are defined so the animation runs
      if (!leftPane.style.transition || leftPane.style.transition === 'none') {
        leftPane.style.transition = 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)'
      }
      if (rightPane && (!rightPane.style.transition || rightPane.style.transition === 'none')) {
        rightPane.style.transition = 'margin-left 300ms cubic-bezier(0.4, 0, 0.2, 1)'
      }
    }

    // Use GPU-accelerated transform for smooth animation
    void leftPane.offsetWidth // reflow to ensure transition triggers
    leftPane.style.transform = 'translate3d(-100%, 0, 0)'

    // Adjust right pane to fill the space
    if (rightPane) {
      const leftPaneWidth = leftPane.offsetWidth
      rightPane.style.marginLeft = `-${leftPaneWidth}px`
    }

    // Update icons
    this.updateToggleIcons(true)
    if (toggleBtn) toggleBtn.classList.add('collapsed')

    // Save state
    window.localStorage.setItem("erd:leftPane:collapsed", "true")

    // Re-enable transitions if they were disabled
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

    // Remove collapsed class
    leftPane.classList.remove('collapsed')

    // Use GPU-accelerated transform for smooth animation
    if (!leftPane.style.transition || leftPane.style.transition === 'none') {
      leftPane.style.transition = 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)'
    }
    void leftPane.offsetWidth
    leftPane.style.transform = 'translate3d(0, 0, 0)'

    // Reset right pane margin
    if (rightPane) {
      if (!rightPane.style.transition || rightPane.style.transition === 'none') {
        rightPane.style.transition = 'margin-left 300ms cubic-bezier(0.4, 0, 0.2, 1)'
      }
      rightPane.style.marginLeft = '0'
    }

    // Update icons
    this.updateToggleIcons(false)
    if (toggleBtn) toggleBtn.classList.remove('collapsed')

    // Save state
    window.localStorage.setItem("erd:leftPane:collapsed", "false")
  }

  updateToggleIcons(collapsed) {
    if (this.hasPanelLeftIconTarget && this.hasPanelRightIconTarget) {
      if (collapsed) {
        // Show "expand" icon (panel-right)
        this.panelLeftIconTarget.classList.add('hidden')
        this.panelRightIconTarget.classList.remove('hidden')
      } else {
        // Show "collapse" icon (panel-left)
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

    // compute sizes using real text measurements to avoid overlap
    const PADX = 18, ROW_H = 28, HDR_H = 34, MIN_W = 260, NAME_TYPE_GAP = 18

    // Create an off-screen measuring layer inside the SVG
    const measureLayer = d3.select(this.svgTarget)
      .append("g")
      .attr("transform", "translate(-10000,-10000)")
      .attr("opacity", 0)
      .attr("pointer-events", "none")

    const measureTextWidth = (text, className) => {
      const n = measureLayer.append("text").attr("class", className).text(text).node()
      // getBBox works only when element is in the DOM and not display:none
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
      t.h = HDR_H + t.fields.length * ROW_H
    })

    // Remove measurement layer now that sizing is computed
    measureLayer.remove()
    const byId = Object.fromEntries(tables.map((t) => [t.id, t]))

    // --- Auto layout (client-side) only if server didn't provide coordinates
    const autoLayout = (nodes, links) => {
      // Build force nodes with center-based coordinates for better physics
      const golden = 2.399963229728653 // golden angle (radians)
      const forceNodes = nodes.map((t, i) => {
        const r = 200 + i * 6
        const cx = (typeof t.x === "number" ? t.x + t.w / 2 : Math.cos(i * golden) * r)
        const cy = (typeof t.y === "number" ? t.y + t.h / 2 : Math.sin(i * golden) * r)
        return { id: t.id, w: t.w, h: t.h, x: cx, y: cy }
      })

      const linkObjs = links.map((l) => ({ source: l.from, target: l.to }))
      const linkDistance = (d) => {
        const a = byId[d.source.id || d.source], b = byId[d.target.id || d.target]
        const base = 220 + Math.max(a.w, b.w) * 0.2 + Math.max(a.h, b.h) * 0.2
        return base
      }

      const sim = d3.forceSimulation(forceNodes)
        .force("charge", d3.forceManyBody().strength(-900))
        .force("link", d3.forceLink(linkObjs).id((d) => d.id).distance(linkDistance).strength(0.3))
        .force("collide", d3.forceCollide().radius((d) => Math.hypot(d.w, d.h) / 2 + 36).iterations(3))
        .force("x", d3.forceX(0).strength(0.04))
        .force("y", d3.forceY(0).strength(0.04))
        .force("center", d3.forceCenter(0, 0))
        .stop()

      const ticks = Math.min(1200, 30 * Math.sqrt(forceNodes.length))
      for (let i = 0; i < ticks; i++) sim.tick()

      // Convert back to top-left coordinates and normalize to positive space
      let minX = Infinity, minY = Infinity
      forceNodes.forEach((n) => {
        const left = n.x - n.w / 2
        const top = n.y - n.h / 2
        minX = Math.min(minX, left)
        minY = Math.min(minY, top)
      })
      const margin = 200
      const dx = margin - minX
      const dy = margin - minY
      forceNodes.forEach((n) => {
        const t = byId[n.id]
        t.x = n.x - n.w / 2 + dx
        t.y = n.y - n.h / 2 + dy
      })
    }

    const hasServerPositions = tables.every((t) => typeof t.x === "number" && typeof t.y === "number")
    if (!hasServerPositions) {
      autoLayout(tables, rels)
    }

    // --- Layout: separate overlapping boxes -------------------------------------------------
    const rectanglesOverlap = (a, b, padding = 0) => {
      return !(
        a.x + a.w + padding <= b.x ||
        b.x + b.w + padding <= a.x ||
        a.y + a.h + padding <= b.y ||
        b.y + b.h + padding <= a.y
      )
    }

    const resolveOverlaps = (nodes, padding = 24, maxIterations = 400) => {
      // Simple iterative separation algorithm: push intersecting rectangles apart
      for (let iter = 0; iter < maxIterations; iter++) {
        let movedAny = false
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const A = nodes[i], B = nodes[j]
            if (!rectanglesOverlap(A, B, padding)) continue

            const aCx = A.x + A.w / 2, aCy = A.y + A.h / 2
            const bCx = B.x + B.w / 2, bCy = B.y + B.h / 2
            let dx = aCx - bCx
            let dy = aCy - bCy
            if (dx === 0 && dy === 0) {
              dx = (Math.random() - 0.5)
              dy = (Math.random() - 0.5)
            }
            const len = Math.max(1, Math.sqrt(dx * dx + dy * dy))
            const push = 10 // how much to separate this iteration
            const ux = (dx / len) * push
            const uy = (dy / len) * push

            A.x += ux
            A.y += uy
            B.x -= ux
            B.y -= uy
            movedAny = true
          }
        }
        if (!movedAny) {
          break
        }
      }
    }

    // Run initial de-overlap pass
    // If client laid out, run a short repel pass to resolve any residual overlaps
    if (!tables.every((t) => typeof t.x === "number" && typeof t.y === "number")) {
      resolveOverlaps(tables, 28, 200)
    }

    // Measure content bounds for initial centering only (canvas is fixed size)
    const bounds = (() => {
      const minX = Math.min(...tables.map((n) => n.x))
      const minY = Math.min(...tables.map((n) => n.y))
      const maxX = Math.max(...tables.map((n) => n.x + n.w))
      const maxY = Math.max(...tables.map((n) => n.y + n.h))
      return { minX, minY, maxX, maxY }
    })()
    // Re-center scroll to the content inside the fixed canvas
    const centerScroll = () => {
      const container = this.svgTarget.parentElement
      if (!container) return
      const contentCenterX = (bounds.minX + bounds.maxX) / 2
      const contentCenterY = (bounds.minY + bounds.maxY) / 2
      const left = Math.max(0, contentCenterX - container.clientWidth / 2)
      const top = Math.max(0, contentCenterY - container.clientHeight / 2)
      container.scrollLeft = left
      container.scrollTop = top
    }
    requestAnimationFrame(centerScroll)

    // draw
    this.clear(false)

    // Define drag handlers before using them
    const self = this
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
      // Keep the layout stable: do not auto-resolve overlaps or recenter/reflow the canvas
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

    // Header with rounded top corners only
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

    gTable.each(function (d) {
      const g = d3.select(this)
      d.fields.forEach((f, i) => {
        const y = HDR_H + i * ROW_H
        g.append("rect").attr("class", "row" + (i % 2 ? " alt" : ""))
          .attr("x", 0).attr("y", y).attr("width", d.w).attr("height", ROW_H)
        g.append("text").attr("class", "cell-name")
          .attr("x", PADX).attr("y", y + ROW_H / 2 + 5).text(f[0])
        g.append("text").attr("class", "cell-type")
          .attr("x", d.w - PADX).attr("y", y + ROW_H / 2 + 5).text(f[1])
      })
    })

    // Distinct colors for overlapping relationship lines
    const linkColorPalette = [
      "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899",
      "#06b6d4", "#14b8a6", "#84cc16", "#e11d48", "#0ea5e9", "#22c55e",
      "#a855f7", "#f43f5e", "#f97316", "#eab308", "#38bdf8", "#34d399",
      "#60a5fa", "#a3e635", "#fb923c", "#c084fc", "#fbbf24", "#4ade80"
    ]

    const linkObjs = rels.map((r, idx) => {
      const color = linkColorPalette[idx % linkColorPalette.length]
      return {
        ...r,
        color,
        p: this.linkLayer.append("path").attr("class", "link").style("stroke", color),
        sLab: this.labelLayer.append("text").attr("class", "cardmark").style("fill", color),
        eLab: this.labelLayer.append("text").attr("class", "cardmark").style("fill", color)
      }
    })

    const OFFSET = 12
    const off = 6

    const boxOf = (t) => ({ x: t.x, y: t.y, w: t.w, h: t.h })
    const autoAnchor = (A, B) => {
      const aCx = A.x + A.w / 2, aCy = A.y + A.h / 2
      const bCx = B.x + B.w / 2, bCy = B.y + B.h / 2
      const dx = bCx - aCx, dy = bCy - aCy
      return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "bottom" : "top")
    }
    const anchorPoint = (box, side) => {
      switch (side) {
        case "left": return { x: box.x, y: box.y + box.h / 2, dir: { x: -1, y: 0 } }
        case "right": return { x: box.x + box.w, y: box.y + box.h / 2, dir: { x: 1, y: 0 } }
        case "top": return { x: box.x + box.w / 2, y: box.y, dir: { x: 0, y: -1 } }
        case "bottom": return { x: box.x + box.w / 2, y: box.y + box.h, dir: { x: 0, y: 1 } }
      }
    }

    // Slot-based anchors to avoid merging multiple edges into one line on a side
    const anchorPointWithSlot = (box, side, slotIndex, totalSlots) => {
      const edgePadding = 10
      if (totalSlots <= 1) return anchorPoint(box, side)
      const t = (slotIndex + 1) / (totalSlots + 1)
      switch (side) {
        case "left":
          return { x: box.x, y: box.y + edgePadding + (box.h - 2 * edgePadding) * t, dir: { x: -1, y: 0 } }
        case "right":
          return { x: box.x + box.w, y: box.y + edgePadding + (box.h - 2 * edgePadding) * t, dir: { x: 1, y: 0 } }
        case "top":
          return { x: box.x + edgePadding + (box.w - 2 * edgePadding) * t, y: box.y, dir: { x: 0, y: -1 } }
        case "bottom":
          return { x: box.x + edgePadding + (box.w - 2 * edgePadding) * t, y: box.y + box.h, dir: { x: 0, y: 1 } }
      }
    }

    const manhattan = (p1, p2, side1, side2) => {
      const a1 = { x: p1.x + p1.dir.x * OFFSET, y: p1.y + p1.dir.y * OFFSET }
      const a2 = { x: p2.x + p2.dir.x * OFFSET, y: p2.y + p2.dir.y * OFFSET }
      let mid1, mid2
      if (side1 === "left" || side1 === "right") {
        if (side2 === "left" || side2 === "right") {
          const mx = (a1.x + a2.x) / 2
          mid1 = { x: mx, y: a1.y }; mid2 = { x: mx, y: a2.y }
          return [p1, a1, mid1, mid2, a2, p2]
        } else {
          mid1 = { x: a2.x, y: a1.y }
          return [p1, a1, mid1, a2, p2]
        }
      } else {
        if (side2 === "top" || side2 === "bottom") {
          const my = (a1.y + a2.y) / 2
          mid1 = { x: a1.x, y: my }; mid2 = { x: a2.x, y: my }
          return [p1, a1, mid1, mid2, a2, p2]
        } else {
          mid1 = { x: a1.x, y: a2.y }
          return [p1, a1, mid1, a2, p2]
        }
      }
    }

    const simplifyOrthogonal = (pts) => {
      if (pts.length <= 2) return pts
      const res = [pts[0]]
      for (let i = 1; i < pts.length - 1; i++) {
        const a = res[res.length - 1]
        const b = pts[i]
        const c = pts[i + 1]
        // Preserve the first joint next to the source and the last joint next to the target
        if (i === 1 || i === pts.length - 2) { res.push(b); continue }
        const abH = a.y === b.y, bcH = b.y === c.y
        const abV = a.x === b.x, bcV = b.x === c.x
        if ((abH && bcH) || (abV && bcV)) {
          // b is redundant
          continue
        }
        res.push(b)
      }
      res.push(pts[pts.length - 1])
      return res
    }

    const chooseRoute = (A, B, sideA, sideB, slotA, slotsA, slotB, slotsB) => {
      const p1 = anchorPointWithSlot(boxOf(A), sideA, slotA, slotsA)
      const p2 = anchorPointWithSlot(boxOf(B), sideB, slotB, slotsB)
      return { points: simplifyOrthogonal(manhattan(p1, p2, sideA, sideB)), sideA, sideB }
    }

    const toPathWithRoundedCorners = (pts, radius = 3) => {
      if (pts.length < 3) {
        // Not enough points for curves, use straight lines
        return pts.map((p, i) => (i ? `L${p.x},${p.y}` : `M${p.x},${p.y}`)).join(" ")
      }

      let path = `M${pts[0].x},${pts[0].y}`

      for (let i = 1; i < pts.length - 1; i++) {
        const prev = pts[i - 1]
        const curr = pts[i]
        const next = pts[i + 1]

        // Calculate distances to determine curve radius
        const d1 = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2)
        const d2 = Math.sqrt((next.x - curr.x) ** 2 + (next.y - curr.y) ** 2)
        const r = Math.min(radius, d1 / 2, d2 / 2)

        if (r < 1) {
          // Too small for a curve, use straight line
          path += ` L${curr.x},${curr.y}`
          continue
        }

        // Calculate curve start and end points
        const ratio1 = r / d1
        const ratio2 = r / d2
        const curveStart = {
          x: curr.x - (curr.x - prev.x) * ratio1,
          y: curr.y - (curr.y - prev.y) * ratio1
        }
        const curveEnd = {
          x: curr.x + (next.x - curr.x) * ratio2,
          y: curr.y + (next.y - curr.y) * ratio2
        }

        path += ` L${curveStart.x},${curveStart.y} Q${curr.x},${curr.y} ${curveEnd.x},${curveEnd.y}`
      }

      // Add final point
      path += ` L${pts[pts.length - 1].x},${pts[pts.length - 1].y}`
      return path
    }

    const updateLinks = () => {
      const updates = []
      // First pass: compute side counts so we can assign slots
      const sideCounts = {}
      const sideUsed = {}
      const planned = []
      linkObjs.forEach((L) => {
        const A = byId[L.from], B = byId[L.to]
        if (!A || !B) return
        const sideA = autoAnchor(A, B)
        const sideB = autoAnchor(B, A)
        sideCounts[A.id] = sideCounts[A.id] || { left: 0, right: 0, top: 0, bottom: 0 }
        sideCounts[B.id] = sideCounts[B.id] || { left: 0, right: 0, top: 0, bottom: 0 }
        sideCounts[A.id][sideA]++
        sideCounts[B.id][sideB]++
        planned.push({ L, A, B, sideA, sideB })
      })

      planned.forEach(({ L, A, B, sideA, sideB }) => {
        sideUsed[A.id] = sideUsed[A.id] || { left: 0, right: 0, top: 0, bottom: 0 }
        sideUsed[B.id] = sideUsed[B.id] || { left: 0, right: 0, top: 0, bottom: 0 }
        const slotA = sideUsed[A.id][sideA]++
        const slotB = sideUsed[B.id][sideB]++

        const routed = chooseRoute(A, B, sideA, sideB, slotA, sideCounts[A.id][sideA], slotB, sideCounts[B.id][sideB])
        const pts = routed.points

        updates.push(() => L.p.attr("d", toPathWithRoundedCorners(pts)))

        const s0 = pts[0], s1 = pts[1]
        const eN = pts.length - 1, e0 = pts[eN - 1], e1 = pts[eN]
        const sMid = { x: (s0.x + s1.x) / 2, y: (s0.y + s1.y) / 2 }
        const eMid = { x: (e0.x + e1.x) / 2, y: (e0.y + e1.y) / 2 }

        const sHoriz = (s0.y === s1.y), eHoriz = (e0.y === e1.y)
        const sText = L.fromCard === "1" ? "1" : "*"
        const eText = L.toCard === "1" ? "1" : "*"

        if (sHoriz) {
          updates.push(() => L.sLab.text(sText).attr("x", sMid.x).attr("y", sMid.y - off)
            .attr("text-anchor", "middle").attr("dominant-baseline", "central"))
        } else {
          const right = s1.x > s0.x
          const near = right ? -off : off
          updates.push(() => L.sLab.text(sText).attr("x", sMid.x + near).attr("y", sMid.y)
            .attr("text-anchor", right ? "end" : "start").attr("dominant-baseline", "central"))
        }

        if (eHoriz) {
          updates.push(() => L.eLab.text(eText).attr("x", eMid.x).attr("y", eMid.y - off)
            .attr("text-anchor", "middle").attr("dominant-baseline", "central"))
        } else {
          const right = e1.x > e0.x
          const near = right ? -off : off
          updates.push(() => L.eLab.text(eText).attr("x", eMid.x + near).attr("y", eMid.y)
            .attr("text-anchor", right ? "end" : "start").attr("dominant-baseline", "central"))
        }
        // Canvas is fixed; no dynamic resizing on drag/route updates
      })

      updates.forEach(update => update())
    }

    // drag handlers declared above

    updateLinks()
  }
}


