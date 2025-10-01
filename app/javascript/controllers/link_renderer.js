export class LinkRenderer {
  constructor(layoutManager) {
    this.layoutManager = layoutManager
  }

  render(linkLayer, labelLayer, rels, colorAtIndex, byId) {
    const linkObjs = rels.map((r, idx) => {
      const color = colorAtIndex(idx)
      return {
        ...r,
        color,
        p: linkLayer.append("path").attr("class", "link").style("stroke", color),
        sLab: labelLayer.append("text").attr("class", "cardmark").style("fill", color),
        eLab: labelLayer.append("text").attr("class", "cardmark").style("fill", color)
      }
    })

    const update = () => {
      const fn = this.layoutManager.updateLinks(linkObjs, byId)
      fn()
    }

    return { linkObjs, update }
  }
}


