import * as d3 from "d3"

export class CompactionManager {
  constructor(controller) {
    this.controller = controller
    this.isCompact = false
  }

  toggle() {
    this.isCompact = !this.isCompact
    const compactButton = this.controller.hasCompactButtonTarget ? this.controller.compactButtonTarget : null
    if (compactButton) {
      compactButton.classList.toggle('bg-red-600', this.isCompact)
      compactButton.classList.toggle('text-white', this.isCompact)
      compactButton.classList.toggle('text-gray-700', !this.isCompact)
      compactButton.classList.toggle('hover:bg-gray-50', !this.isCompact)
      compactButton.classList.toggle('hover:bg-red-700', this.isCompact)
    }

    const allTableGroups = this.controller.tableLayer.selectAll('.table')
    const ANIMATION_DURATION_MS = 260
    const manager = this

    allTableGroups.each(function(tableDatum) {
      const tableGroup = d3.select(this)
      const extraRows = tableGroup.selectAll('[data-extra="1"]')
      const outlineRect = tableGroup.select('rect.table-outline')
      const fullHeight = tableDatum.fullH
      const compactHeight = tableDatum.compactH
      const targetHeight = manager.isCompact ? compactHeight : fullHeight
      const startHeight = typeof tableDatum.h === 'number' ? tableDatum.h : +outlineRect.attr('height') || fullHeight
      const transition = outlineRect.transition().duration(ANIMATION_DURATION_MS).attr('height', targetHeight)
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
      headerPath.transition().duration(ANIMATION_DURATION_MS).attrTween('d', function() {
        const width = tableDatum.w
        const endPath = roundedTopRectPath(width, manager.controller._HDR_H, 8)
        return () => endPath
      })

      if (extraRows.empty()) return
      if (manager.isCompact) {
        extraRows.transition().duration(ANIMATION_DURATION_MS).attr('opacity', 0).on('end', function() { d3.select(this).style('display', 'none') })
      } else {
        extraRows.style('display', null).transition().duration(ANIMATION_DURATION_MS).attr('opacity', 1)
      }
    })

    if (this.controller._updateLinks) this.controller._updateLinks()
  }
}
