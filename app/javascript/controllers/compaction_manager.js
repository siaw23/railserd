import * as d3 from "d3"
import { COMPACTION_MS, CSS } from "./constants"

export class CompactionManager {
  constructor(controller) {
    this.controller = controller
    this.isCompact = false
  }

  toggle() {
    this.isCompact = !this.isCompact
    const compactButton = this.controller.hasCompactButtonTarget ? this.controller.compactButtonTarget : null
    if (compactButton) {
      CSS.compactActive.forEach((c) => compactButton.classList.toggle(c, this.isCompact))
      CSS.compactInactive.forEach((c) => compactButton.classList.toggle(c, !this.isCompact))
    }

    const allTableGroups = this.controller.tableLayer.selectAll('.table')
    const manager = this

    allTableGroups.each(function(tableDatum) {
      const tableGroup = d3.select(this)
      const extraRows = tableGroup.selectAll('[data-extra="1"]')
      const outlineRect = tableGroup.select('rect.table-outline')
      const fullHeight = tableDatum.fullH
      const compactHeight = tableDatum.compactH
      const targetHeight = manager.isCompact ? compactHeight : fullHeight
      const startHeight = typeof tableDatum.h === 'number' ? tableDatum.h : +outlineRect.attr('height') || fullHeight
      const transition = outlineRect.transition().duration(COMPACTION_MS).attr('height', targetHeight)
      transition.tween('relink', function() {
        let animationFramePending = false
        return function(progress) {
          tableDatum.h = startHeight + (targetHeight - startHeight) * progress
          if (!animationFramePending) {
            animationFramePending = true
            requestAnimationFrame(() => {
              animationFramePending = false
              if (manager.controller._updateLinks) manager.controller._updateLinks()
            })
          }
        }
      }).on('end', function() {
        tableDatum.h = targetHeight
        if (manager.controller._updateLinks) manager.controller._updateLinks()
      })

      const headerPath = tableGroup.select('path.header')
      const roundedTopRectPath = (width, height, radius) => {
        const rectWidth = width
        const rectHeight = height
        const r = Math.min(radius, rectWidth / 2, rectHeight)
        return `M0,${r} Q0,0 ${r},0 H${rectWidth - r} Q${rectWidth},0 ${rectWidth},${r} V${rectHeight} H0 Z`
      }
      headerPath.transition().duration(COMPACTION_MS).attrTween('d', function() {
        const width = tableDatum.w
        const endPath = roundedTopRectPath(width, manager.controller._HDR_H, 8)
        return () => endPath
      })

      if (extraRows.empty()) return
      if (manager.isCompact) {
        extraRows.transition().duration(COMPACTION_MS).attr('opacity', 0).on('end', function() { d3.select(this).style('display', 'none') })
      } else {
        extraRows.style('display', null).transition().duration(COMPACTION_MS).attr('opacity', 1)
      }
    })

    if (this.controller._updateLinks) this.controller._updateLinks()
  }
}
