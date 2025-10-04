import { ZOOM_FIT_PADDING, OFFSETS } from "./constants"

export function fitToViewport(zoomManager, bounds, depthControlsElement = null) {
  const reservedBottom = depthControlsElement
    ? (depthControlsElement.offsetHeight + (OFFSETS.reservedBottomExtraPx || 0))
    : 0

  zoomManager.fitToViewport(bounds, {
    padding: ZOOM_FIT_PADDING || 40,
    reservedBottom,
    animate: false
  })
}
