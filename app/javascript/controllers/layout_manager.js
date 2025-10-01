import * as d3 from "d3"

export class LayoutManager {
  constructor() {
    this.OFFSET = 12
  }

  /**
   * Apply force-directed layout to nodes
   * @param {Array} nodes - Array of table nodes with id, w, h, x, y
   * @param {Array} links - Array of links with from, to
   * @param {Object} byId - Lookup object for nodes by id
   */
  applyForceLayout(nodes, links, byId) {
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

    // Translate to positive coordinates
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

  /**
   * Check if two rectangles overlap
   * @param {Object} a - Rectangle with x, y, w, h
   * @param {Object} b - Rectangle with x, y, w, h
   * @param {number} padding - Padding around rectangles
   * @returns {boolean}
   */
  rectanglesOverlap(a, b, padding = 0) {
    return !(
      a.x + a.w + padding <= b.x ||
      b.x + b.w + padding <= a.x ||
      a.y + a.h + padding <= b.y ||
      b.y + b.h + padding <= a.y
    )
  }

  /**
   * Resolve overlapping nodes by pushing them apart
   * @param {Array} nodes - Array of nodes with x, y, w, h
   * @param {number} padding - Minimum padding between nodes
   * @param {number} maxIterations - Maximum iterations to run
   */
  resolveOverlaps(nodes, padding = 24, maxIterations = 400) {
    for (let iter = 0; iter < maxIterations; iter++) {
      let movedAny = false
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const A = nodes[i], B = nodes[j]
          if (!this.rectanglesOverlap(A, B, padding)) continue

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

  /**
   * Determine best anchor side for connecting A to B
   * @param {Object} A - Source rectangle
   * @param {Object} B - Target rectangle
   * @returns {string} - "left", "right", "top", or "bottom"
   */
  autoAnchor(A, B) {
    const aCx = A.x + A.w / 2, aCy = A.y + A.h / 2
    const bCx = B.x + B.w / 2, bCy = B.y + B.h / 2
    const dx = bCx - aCx, dy = bCy - aCy
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "bottom" : "top")
  }

  /**
   * Get anchor point on a box side
   * @param {Object} box - Rectangle with x, y, w, h
   * @param {string} side - "left", "right", "top", or "bottom"
   * @returns {Object} - Point with x, y, and direction vector
   */
  anchorPoint(box, side) {
    switch (side) {
      case "left": return { x: box.x, y: box.y + box.h / 2, dir: { x: -1, y: 0 } }
      case "right": return { x: box.x + box.w, y: box.y + box.h / 2, dir: { x: 1, y: 0 } }
      case "top": return { x: box.x + box.w / 2, y: box.y, dir: { x: 0, y: -1 } }
      case "bottom": return { x: box.x + box.w / 2, y: box.y + box.h, dir: { x: 0, y: 1 } }
    }
  }

  /**
   * Get anchor point with slot distribution for multiple links on same side
   * @param {Object} box - Rectangle with x, y, w, h
   * @param {string} side - "left", "right", "top", or "bottom"
   * @param {number} slotIndex - Index of this link (0-based)
   * @param {number} totalSlots - Total number of links on this side
   * @returns {Object} - Point with x, y, and direction vector
   */
  anchorPointWithSlot(box, side, slotIndex, totalSlots) {
    const edgePadding = 10
    if (totalSlots <= 1) return this.anchorPoint(box, side)
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

  /**
   * Create Manhattan routing between two points
   * @param {Object} p1 - Start point with x, y, dir
   * @param {Object} p2 - End point with x, y, dir
   * @param {string} side1 - Start side
   * @param {string} side2 - End side
   * @returns {Array} - Array of points
   */
  manhattan(p1, p2, side1, side2) {
    const a1 = { x: p1.x + p1.dir.x * this.OFFSET, y: p1.y + p1.dir.y * this.OFFSET }
    const a2 = { x: p2.x + p2.dir.x * this.OFFSET, y: p2.y + p2.dir.y * this.OFFSET }
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

  /**
   * Simplify orthogonal path by removing redundant points
   * @param {Array} pts - Array of points
   * @returns {Array} - Simplified array of points
   */
  simplifyOrthogonal(pts, epsilon = 2) {
    if (pts.length <= 2) return pts
    const eq = (a, b) => Math.abs(a - b) <= epsilon

    // First pass: snap nearly-aligned coordinates
    const snapped = pts.map(p => ({ x: p.x, y: p.y }))
    for (let i = 0; i < snapped.length - 1; i++) {
      const curr = snapped[i]
      const next = snapped[i + 1]
      if (eq(curr.x, next.x)) {
        const avgX = (curr.x + next.x) / 2
        curr.x = avgX
        next.x = avgX
      }
      if (eq(curr.y, next.y)) {
        const avgY = (curr.y + next.y) / 2
        curr.y = avgY
        next.y = avgY
      }
    }

    // Second pass: remove redundant points
    const res = [snapped[0]]
    for (let i = 1; i < snapped.length - 1; i++) {
      const a = res[res.length - 1]
      const b = snapped[i]
      const c = snapped[i + 1]

      const abH = eq(a.y, b.y), bcH = eq(b.y, c.y)
      const abV = eq(a.x, b.x), bcV = eq(b.x, c.x)

      // Skip collinear points
      if ((abH && bcH) || (abV && bcV)) continue

      // Skip if creates tiny dogleg
      if (eq(a.y, c.y) && eq(a.x, c.x)) continue

      res.push(b)
    }
    res.push(snapped[snapped.length - 1])
    return res
  }

  /**
   * Choose the best route between two boxes
   * @param {Object} A - Source box
   * @param {Object} B - Target box
   * @param {string} sideA - Side of A to connect from
   * @param {string} sideB - Side of B to connect to
   * @param {number} slotA - Slot index on side A
   * @param {number} slotsA - Total slots on side A
   * @param {number} slotB - Slot index on side B
   * @param {number} slotsB - Total slots on side B
   * @returns {Object} - Route with points, sideA, sideB
   */
  chooseRoute(A, B, sideA, sideB, slotA, slotsA, slotB, slotsB) {
    const boxA = { x: A.x, y: A.y, w: A.w, h: A.h }
    const boxB = { x: B.x, y: B.y, w: B.w, h: B.h }
    const p1 = this.anchorPointWithSlot(boxA, sideA, slotA, slotsA)
    const p2 = this.anchorPointWithSlot(boxB, sideB, slotB, slotsB)
    return { points: this.simplifyOrthogonal(this.manhattan(p1, p2, sideA, sideB)), sideA, sideB }
  }

  /**
   * Convert points to SVG path with rounded corners
   * @param {Array} pts - Array of points
   * @param {number} radius - Corner radius
   * @returns {string} - SVG path string
   */
  toPathWithRoundedCorners(pts, radius = 3) {
    if (pts.length < 3) {
      // straight line or single point
      return pts.map((p, i) => (i ? `L${p.x},${p.y}` : `M${p.x},${p.y}`)).join(" ")
    }

    let path = `M${pts[0].x},${pts[0].y}`

    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1]
      const curr = pts[i]
      const next = pts[i + 1]

      const eq = (a, b) => Math.abs(a - b) <= 2
      // If three consecutive points are effectively collinear, keep it as a straight segment
      if ((eq(prev.y, curr.y) && eq(curr.y, next.y)) || (eq(prev.x, curr.x) && eq(curr.x, next.x))) {
        path += ` L${curr.x},${curr.y}`
        continue
      }

      // Calculate distances to ensure we don't over-round
      const d1 = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2)
      const d2 = Math.sqrt((next.x - curr.x) ** 2 + (next.y - curr.y) ** 2)
      const r = Math.min(radius, d1 / 2, d2 / 2)

      if (r < 1) {
        // segment too short, just use line
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

    // Final segment
    path += ` L${pts[pts.length - 1].x},${pts[pts.length - 1].y}`
    return path
  }

  /**
   * Update all links based on current node positions
   * @param {Array} linkObjs - Array of link objects with from, to, p (path), sLab, eLab, fromCard, toCard
   * @param {Object} byId - Lookup object for nodes by id
   * @returns {Function} - Function that executes all DOM updates
   */
  updateLinks(linkObjs, byId) {
    const updates = []
    const off = 6

    const sideCounts = {}
    const sideUsed = {}
    const planned = []
    linkObjs.forEach((L) => {
      const A = byId[L.from], B = byId[L.to]
      if (!A || !B) return
      const sideA = this.autoAnchor(A, B)
      const sideB = this.autoAnchor(B, A)
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

      const routed = this.chooseRoute(A, B, sideA, sideB, slotA, sideCounts[A.id][sideA], slotB, sideCounts[B.id][sideB])
      const pts = routed.points

      updates.push(() => L.p.attr("d", this.toPathWithRoundedCorners(pts)))

      const s0 = pts[0], s1 = pts[1]
      const eN = pts.length - 1, e0 = pts[eN - 1], e1 = pts[eN]
      const eq = (a,b) => Math.abs(a-b) <= 1.5
      const sHoriz = eq(s0.y, s1.y), eHoriz = eq(e0.y, e1.y)
      const LABEL_NEAR = 14
      const startDir = { x: Math.sign(s1.x - s0.x) || 0, y: Math.sign(s1.y - s0.y) || 0 }
      const endDir = { x: Math.sign(e1.x - e0.x) || 0, y: Math.sign(e1.y - e0.y) || 0 }
      const sNear = sHoriz
        ? { x: s0.x + LABEL_NEAR * (startDir.x || 1), y: s0.y }
        : { x: s0.x, y: s0.y + LABEL_NEAR * (startDir.y || 1) }
      const eNear = eHoriz
        ? { x: e1.x - LABEL_NEAR * (endDir.x || 1), y: e1.y }
        : { x: e1.x, y: e1.y - LABEL_NEAR * (endDir.y || 1) }
      const sText = L.fromCard === "1" ? "1" : "*"
      const eText = L.toCard === "1" ? "1" : "*"

      if (sHoriz) {
        updates.push(() => L.sLab.text(sText).attr("x", sNear.x).attr("y", sNear.y - off - 2)
          .attr("text-anchor", startDir.x >= 0 ? "start" : "end").attr("dominant-baseline", "central"))
      } else {
        const right = s1.x > s0.x
        const near = right ? -off : off
        updates.push(() => L.sLab.text(sText).attr("x", sNear.x + near).attr("y", sNear.y)
          .attr("text-anchor", right ? "end" : "start").attr("dominant-baseline", "central"))
      }

      if (eHoriz) {
        updates.push(() => L.eLab.text(eText).attr("x", eNear.x).attr("y", eNear.y - off - 2)
          .attr("text-anchor", endDir.x >= 0 ? "end" : "start").attr("dominant-baseline", "central"))
      } else {
        const right = e1.x > e0.x
        const near = right ? -off : off
        updates.push(() => L.eLab.text(eText).attr("x", eNear.x + near).attr("y", eNear.y)
          .attr("text-anchor", right ? "end" : "start").attr("dominant-baseline", "central"))
      }

    })

    return () => updates.forEach(update => update())
  }
}

