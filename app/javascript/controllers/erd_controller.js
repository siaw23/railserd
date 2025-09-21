import { Controller } from "@hotwired/stimulus"
import * as d3 from "d3"

// Connects to data-controller="erd"
export default class extends Controller {
  static targets = ["input", "svg", "emptyState"]

  connect() {
    this.root = d3.select(this.svgTarget).append("g")
    this.linkLayer = this.root.append("g")
    this.labelLayer = this.root.append("g")
    this.tableLayer = this.root.append("g")

    this.zoom = d3.zoom().scaleExtent([0.6, 2]).on("zoom", (e) => this.root.attr("transform", e.transform))
    d3.select(this.svgTarget).call(this.zoom).on("dblclick.zoom", null)

    this._debounceTimer = null
  }

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

  render(graph) {
    const tables = graph.nodes.map((n, i) => ({
      id: n.id,
      fields: n.fields,
      x: n.x || (150 + (i % 3) * 300),
      y: n.y || (100 + Math.floor(i / 3) * 250)
    }))
    const rels = graph.links

    if (tables.length === 0) {
      this.clear(true)
      return
    }

    this.hideEmptyState()

    // compute sizes
    const PADX = 16, ROW_H = 26, HDR_H = 30, TYPE_W = 82, MIN_W = 240
    tables.forEach((t) => {
      const nameW = Math.max(...t.fields.map((f) => f[0].length), 2) * 7.2
      t.w = Math.max(MIN_W, PADX * 2 + nameW + TYPE_W)
      t.h = HDR_H + t.fields.length * ROW_H
    })
    const byId = Object.fromEntries(tables.map((t) => [t.id, t]))

    // draw
    this.clear(false)

    // Define drag handlers before using them
    function dragstart(event, d) { d3.select(this).raise() }
    function dragged(event, d) {
      d.x = event.x; d.y = event.y
      d3.select(this).attr("transform", `translate(${d.x},${d.y})`)
      updateLinks()
    }
    function dragend(event, d) { }

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

    const linkObjs = rels.map((r) => ({
      ...r,
      p: this.linkLayer.append("path").attr("class", "link"),
      sLab: this.labelLayer.append("text").attr("class", "cardmark"),
      eLab: this.labelLayer.append("text").attr("class", "cardmark")
    }))

    const OFFSET = 18
    const off = 10

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
      linkObjs.forEach((L) => {
        const A = byId[L.from], B = byId[L.to]
        if (!A || !B) return
        const sideA = autoAnchor(A, B), sideB = autoAnchor(B, A)
        const p1 = anchorPoint(boxOf(A), sideA), p2 = anchorPoint(boxOf(B), sideB)
        const pts = manhattan(p1, p2, sideA, sideB)

        L.p.attr("d", toPathWithRoundedCorners(pts))

        const s0 = pts[0], s1 = pts[1]
        const eN = pts.length - 1, e0 = pts[eN - 1], e1 = pts[eN]
        const sMid = { x: (s0.x + s1.x) / 2, y: (s0.y + s1.y) / 2 }
        const eMid = { x: (e0.x + e1.x) / 2, y: (e0.y + e1.y) / 2 }

        const sHoriz = (s0.y === s1.y), eHoriz = (e0.y === e1.y)
        const sText = L.fromCard === "1" ? "1" : "*"
        const eText = L.toCard === "1" ? "1" : "*"

        if (sHoriz) {
          L.sLab.text(sText).attr("x", sMid.x).attr("y", sMid.y - off)
            .attr("text-anchor", "middle").attr("dominant-baseline", "central")
        } else {
          const right = s1.x > s0.x
          L.sLab.text(sText).attr("x", sMid.x + (right ? off : -off)).attr("y", sMid.y)
            .attr("text-anchor", right ? "start" : "end").attr("dominant-baseline", "central")
        }

        if (eHoriz) {
          L.eLab.text(eText).attr("x", eMid.x).attr("y", eMid.y - off)
            .attr("text-anchor", "middle").attr("dominant-baseline", "central")
        } else {
          const right = e1.x > e0.x
          L.eLab.text(eText).attr("x", eMid.x + (right ? off : -off)).attr("y", eMid.y)
            .attr("text-anchor", right ? "start" : "end").attr("dominant-baseline", "central")
        }
      })
    }

    // drag handlers declared above

    updateLinks()
  }
}


