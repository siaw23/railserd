import * as d3 from "d3"

/**
 * ZoomManager - Handles all zoom and pan operations for the ERD canvas
 */
export class ZoomManager {
  constructor(svgElement, rootGroup, options = {}) {
    this.svgElement = svgElement
    this.rootGroup = rootGroup
    this.minScale = options.minScale || 0.2
    this.maxScale = options.maxScale || 3

    this._initZoom()
  }

  _initZoom() {
    this.zoom = d3.zoom()
      .scaleExtent([this.minScale, this.maxScale])
      .on("zoom", (event) => {
        this.rootGroup.attr("transform", event.transform)
      })

    const svgSel = d3.select(this.svgElement)
    svgSel.call(this.zoom).on("dblclick.zoom", null)
  }

  /**
   * Zoom by a specific factor
   * @param {number} factor - Multiplier for zoom (e.g., 1.2 to zoom in)
   * @param {number} duration - Animation duration in ms (default: 200)
   */
  zoomBy(factor, duration = 200) {
    const svgSel = d3.select(this.svgElement)
    svgSel.transition()
      .duration(duration)
      .call(this.zoom.scaleBy, factor)
  }

  /**
   * Zoom in by 20%
   */
  zoomIn() {
    this.zoomBy(1.2)
  }

  /**
   * Zoom out by ~17%
   */
  zoomOut() {
    this.zoomBy(1 / 1.2)
  }

  /**
   * Reset zoom transform to identity
   */
  resetTransform() {
    const svgSel = d3.select(this.svgElement)
    svgSel.call(this.zoom.transform, d3.zoomIdentity)
  }

  /**
   * Get the current zoom transform
   * @returns {d3.ZoomTransform}
   */
  getCurrentTransform() {
    return d3.zoomTransform(this.svgElement)
  }

  /**
   * Get the current center point of the viewport in ERD coordinates
   * @returns {Object} - {x, y} coordinates
   */
  getCurrentCenter() {
    const container = this.svgElement.parentElement
    if (!container) return { x: 0, y: 0 }

    const transform = this.getCurrentTransform()
    const centerX = (container.clientWidth / 2 - transform.x) / transform.k
    const centerY = (container.clientHeight / 2 - transform.y) / transform.k

    return { x: centerX, y: centerY }
  }

  /**
   * Fit content to viewport with padding
   * @param {Object} bounds - Content bounds {minX, minY, maxX, maxY}
   * @param {Object} options - Fitting options
   * @param {number} options.padding - Padding around content (default: 40)
   * @param {number} options.reservedBottom - Reserved space at bottom (default: 0)
   * @param {boolean} options.animate - Whether to animate the transition (default: false)
   */
  fitToViewport(bounds, options = {}) {
    const container = this.svgElement.parentElement
    if (!container) return

    const {
      padding = 40,
      reservedBottom = 0,
      animate = false
    } = options

    const contentW = Math.max(1, bounds.maxX - bounds.minX)
    const contentH = Math.max(1, bounds.maxY - bounds.minY)

    const viewW = Math.max(1, container.clientWidth - padding * 2)
    const viewH = Math.max(1, container.clientHeight - padding * 2 - reservedBottom)

    const rawScale = Math.min(viewW / contentW, viewH / contentH)
    const [minScale, maxScale] = this.zoom.scaleExtent()
    const scale = Math.max(minScale, Math.min(maxScale, rawScale))

    const tx = (container.clientWidth - contentW * scale) / 2 - bounds.minX * scale
    const ty = ((container.clientHeight - reservedBottom) - contentH * scale) / 2 - bounds.minY * scale

    const svgSel = d3.select(this.svgElement)
    const transform = d3.zoomIdentity.translate(tx, ty).scale(scale)

    if (animate) {
      svgSel.transition()
        .duration(450)
        .call(this.zoom.transform, transform)
    } else {
      svgSel.call(this.zoom.transform, transform)
    }
  }

  /**
   * Pan and zoom to center on a specific point
   * @param {number} x - Target x coordinate
   * @param {number} y - Target y coordinate
   * @param {Object} options - Pan options
   * @param {boolean} options.animate - Whether to animate (default: true)
   * @param {number} options.duration - Animation duration in ms (default: 450)
   * @param {number} options.scale - Optional scale to apply (default: current scale)
   */
  panToPoint(x, y, options = {}) {
    const container = this.svgElement.parentElement
    if (!container) return

    const {
      animate = true,
      duration = 450,
      scale = null
    } = options

    const currentTransform = this.getCurrentTransform()
    const targetScale = scale !== null ? scale : currentTransform.k

    const tx = container.clientWidth / 2 - x * targetScale
    const ty = container.clientHeight / 2 - y * targetScale

    const svgSel = d3.select(this.svgElement)
    const transform = d3.zoomIdentity.translate(tx, ty).scale(targetScale)

    if (animate) {
      svgSel.transition()
        .duration(duration)
        .call(this.zoom.transform, transform)
    } else {
      svgSel.call(this.zoom.transform, transform)
    }
  }

  /**
   * Reattach zoom behavior after DOM changes
   * This is useful when the SVG element is recreated
   */
  reattach() {
    this._initZoom()
  }

  /**
   * Get the zoom behavior instance (for advanced usage)
   * @returns {d3.zoom}
   */
  getZoomBehavior() {
    return this.zoom
  }
}

