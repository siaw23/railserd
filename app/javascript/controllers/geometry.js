import * as d3 from "d3"

// Default geometry constants used throughout the ERD rendering
export const DEFAULT_GEOMETRY = {
  PADX: 18,
  ROW_H: 28,
  HDR_H: 34,
  MIN_W: 260,
  NAME_TYPE_GAP: 18
}

// SVG path for a rounded rectangle with only top corners rounded
export function roundedTopRectPath(width, height, radius) {
  const w = width
  const h = height
  const r = Math.min(radius, w / 2, h)
  return `M0,${r} Q0,0 ${r},0 H${w - r} Q${w},0 ${w},${r} V${h} H0 Z`
}

// Create a text measurer bound to a given SVG element. Call destroy() when done.
export function createSvgTextMeasurer(svgElement) {
  const measureLayer = d3.select(svgElement)
    .append("g")
    .attr("transform", "translate(-10000,-10000)")
    .attr("opacity", 0)
    .attr("pointer-events", "none")

  const measureTextWidth = (text, className) => {
    const node = measureLayer.append("text").attr("class", className).text(text).node()
    const w = node.getBBox().width
    node.remove()
    return w
  }

  const destroy = () => {
    try { measureLayer.remove() } catch {}
  }

  return { measureTextWidth, destroy }
}

// Mutates table objects to include width/height based on measured text
export function applyTableDimensions(tables, measureTextWidth, geometry = DEFAULT_GEOMETRY, isCompact = false) {
  const { PADX, ROW_H, HDR_H, MIN_W, NAME_TYPE_GAP } = { ...DEFAULT_GEOMETRY, ...geometry }

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
    t.h = isCompact ? t.compactH : t.fullH
  })

  return { PADX, ROW_H, HDR_H, MIN_W, NAME_TYPE_GAP }
}

// Compute graph bounds from laid out tables
export function computeBoundsFromTables(tables) {
  const minX = Math.min(...tables.map((n) => n.x))
  const minY = Math.min(...tables.map((n) => n.y))
  const maxX = Math.max(...tables.map((n) => n.x + n.w))
  const maxY = Math.max(...tables.map((n) => n.y + n.h))
  return { minX, minY, maxX, maxY }
}


