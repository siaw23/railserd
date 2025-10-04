export class PaneManager {
  constructor(controller) {
    this.c = controller
  }

  toggle() {
    const isCollapsed = this.c.leftPaneTarget.classList.contains('collapsed')
    if (isCollapsed) this.expand()
    else this.collapse()
  }

  collapse(immediate = false) {
    if (!this.c.hasLeftPaneTarget) return
    const leftPane = this.c.leftPaneTarget
    const rightPane = this.c.rightPaneTarget
    const toggleBtn = this.c.hasToggleButtonTarget ? this.c.toggleButtonTarget : null

    leftPane.classList.add('collapsed')

    if (immediate) {
      leftPane.style.transition = 'none'
      if (rightPane) rightPane.style.transition = 'none'
    } else {
      if (!leftPane.style.transition || leftPane.style.transition === 'none') {
        leftPane.style.transition = 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)'
      }
      if (rightPane && (!rightPane.style.transition || rightPane.style.transition === 'none')) {
        rightPane.style.transition = 'margin-left 300ms cubic-bezier(0.4, 0, 0.2, 1)'
      }
    }

    void leftPane.offsetWidth
    leftPane.style.transform = 'translate3d(-100%, 0, 0)'

    if (rightPane) {
      const leftPaneWidth = leftPane.offsetWidth
      rightPane.style.marginLeft = `-${leftPaneWidth}px`
    }

    this.updateIcons(true)
    if (toggleBtn) toggleBtn.classList.add('collapsed')

    window.localStorage.setItem('erd:leftPane:collapsed', 'true')

    if (immediate) {
      setTimeout(() => {
        leftPane.style.transition = ''
        if (rightPane) rightPane.style.transition = ''
      }, 50)
    }
  }

  expand(immediate = false) {
    if (!this.c.hasLeftPaneTarget) return
    const leftPane = this.c.leftPaneTarget
    const rightPane = this.c.rightPaneTarget
    const toggleBtn = this.c.hasToggleButtonTarget ? this.c.toggleButtonTarget : null

    leftPane.classList.remove('collapsed')

    if (!leftPane.style.transition || leftPane.style.transition === 'none') {
      leftPane.style.transition = 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)'
    }
    void leftPane.offsetWidth
    leftPane.style.transform = 'translate3d(0, 0, 0)'

    if (rightPane) {
      if (!rightPane.style.transition || rightPane.style.transition === 'none') {
        rightPane.style.transition = 'margin-left 300ms cubic-bezier(0.4, 0, 0.2, 1)'
      }
      rightPane.style.marginLeft = '0'
    }

    this.updateIcons(false)
    if (toggleBtn) toggleBtn.classList.remove('collapsed')

    window.localStorage.setItem('erd:leftPane:collapsed', 'false')
  }

  updateIcons(collapsed) {
    if (this.c.hasPanelLeftIconTarget && this.c.hasPanelRightIconTarget) {
      if (collapsed) {
        this.c.panelLeftIconTarget.classList.add('hidden')
        this.c.panelRightIconTarget.classList.remove('hidden')
      } else {
        this.c.panelLeftIconTarget.classList.remove('hidden')
        this.c.panelRightIconTarget.classList.add('hidden')
      }
    }
  }
}
