import * as d3 from "d3"
import { ZoomManager } from "./zoom_manager"
import { LinkColorManager } from "./link_color_manager"
import { LayoutManager } from "./layout_manager"

export class CanvasManager {
  constructor(controller) {
    this.c = controller
  }

  initialize() {
    // Create initial layers
    this.c.root = d3.select(this.c.svgTarget).append("g")
    this.c.linkLayer = this.c.root.append("g")
    this.c.labelLayer = this.c.root.append("g")
    this.c.tableLayer = this.c.root.append("g")

    // Initial viewport sizing
    const container = this.c.svgTarget.parentElement
    if (container) {
      const multiplier = 1
      const canvasWidth = Math.max(1, container.clientWidth * multiplier)
      const canvasHeight = Math.max(1, container.clientHeight * multiplier)
      this.c.canvasWidth = canvasWidth
      this.c.canvasHeight = canvasHeight
      const svgSel = d3.select(this.c.svgTarget)
      svgSel.attr("viewBox", `0 0 ${canvasWidth} ${canvasHeight}`)
      svgSel.attr("width", canvasWidth).attr("height", canvasHeight)
      container.scrollLeft = Math.max(0, (canvasWidth - container.clientWidth) / 2)
      container.scrollTop = Math.max(0, (canvasHeight - container.clientHeight) / 2)
    }
  }

  reset() {
    const svgSel = d3.select(this.c.svgTarget)
    svgSel.selectAll("*").remove()
    this.c.root = svgSel.append("g")
    this.c.linkLayer = this.c.root.append("g")
    this.c.labelLayer = this.c.root.append("g")
    this.c.tableLayer = this.c.root.append("g")

    if (this.c.zoomManager) {
      this.c.zoomManager = new ZoomManager(this.c.svgTarget, this.c.root, {
        minScale: 0.2,
        maxScale: 3
      })
    }
    if (this.c.linkColorManager) {
      this.c.linkColorManager.reset()
    } else {
      this.c.linkColorManager = new LinkColorManager()
    }
    if (this.c.layoutManager) {
      this.c.layoutManager = new LayoutManager()
    } else {
      this.c.layoutManager = new LayoutManager()
    }
  }
}
