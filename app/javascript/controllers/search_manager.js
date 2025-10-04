import { DEBOUNCE_SEARCH_MS, PAN_MS } from "./constants"

export class SearchManager {
  constructor(controller) {
    this.controller = controller
    this.debounceTimer = null
    this.previousViewportCenter = null
  }

  onInput(event) {
    const query = (event?.target?.value || '').trim().toLowerCase()
    clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.apply(query)
    }, DEBOUNCE_SEARCH_MS)
  }

  apply(query) {
    const linkObjects = this.controller._linkObjs || []
    const tableSelection = this.controller.tableLayer.selectAll('.table')

    if (!query) {
      tableSelection.classed('dimmed', false)
      linkObjects.forEach((linkObj) => { linkObj.p.classed('dimmed', false); linkObj.sLab.classed('dimmed', false); linkObj.eLab.classed('dimmed', false) })
      if (this.previousViewportCenter) {
        this.controller.zoomManager.panToPoint(this.previousViewportCenter.x, this.previousViewportCenter.y, { animate: true, duration: PAN_MS })
        this.previousViewportCenter = null
      }
      return
    }

    const tableByLowerId = this.controller._tableByLowerId || {}
    const matchedTable = tableByLowerId[query]
    if (!matchedTable) {
      tableSelection.classed('dimmed', true)
      linkObjects.forEach((linkObj) => { linkObj.p.classed('dimmed', true); linkObj.sLab.classed('dimmed', true); linkObj.eLab.classed('dimmed', true) })
      return
    }

    tableSelection.classed('dimmed', (tableDatum) => tableDatum.id !== matchedTable.id)
    linkObjects.forEach((linkObj) => {
      const isOnPath = (linkObj.from === matchedTable.id || linkObj.to === matchedTable.id)
      linkObj.p.classed('dimmed', !isOnPath)
      linkObj.sLab.classed('dimmed', !isOnPath)
      linkObj.eLab.classed('dimmed', !isOnPath)
    })

    if (!this.previousViewportCenter) {
      this.previousViewportCenter = this.controller.zoomManager.getCurrentCenter()
    }

    const targetCenterX = matchedTable.x + matchedTable.w / 2
    const targetCenterY = matchedTable.y + matchedTable.h / 2
    this.controller.zoomManager.panToPoint(targetCenterX, targetCenterY, { animate: true, duration: PAN_MS })
  }
}
