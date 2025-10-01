import * as d3 from "d3"
import { roundedTopRectPath } from "./geometry"

export class TableRenderer {
  render(tableLayer, tables, geometry) {
    const { PADX, ROW_H, HDR_H } = geometry

    const gTable = tableLayer.selectAll(".table")
      .data(tables)
      .enter().append("g")
      .attr("class", "table")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)

    gTable.append("rect").attr("class", "table-outline")
      .attr("width", (d) => d.w).attr("height", (d) => d.h)

    gTable.append("path").attr("class", "header")
      .attr("d", (d) => roundedTopRectPath(d.w, HDR_H, 8))

    gTable.append("text").attr("class", "title")
      .attr("x", PADX).attr("y", HDR_H / 2 + 5).text((d) => d.id)

    gTable.each(function (d) {
      const g = d3.select(this)
      d.fields.forEach((f, i) => {
        const y = HDR_H + i * ROW_H
        const row = g.append("rect").attr("class", "row" + (i % 2 ? " alt" : ""))
          .attr("x", 0).attr("y", y).attr("width", d.w).attr("height", ROW_H)
        const name = g.append("text").attr("class", "cell-name")
          .attr("x", PADX).attr("y", y + ROW_H / 2 + 5).text(f[0])
        const type = g.append("text").attr("class", "cell-type")
          .attr("x", d.w - PADX).attr("y", y + ROW_H / 2 + 5).text(f[1])

        if (i >= 3) {
          const initialOpacity = (typeof window.__erdCompactInit === 'boolean' ? (window.__erdCompactInit ? 0 : 1) : 1)
          const display = initialOpacity === 0 ? "none" : null
          row.attr("data-extra", "1").attr("opacity", initialOpacity)
          name.attr("data-extra", "1").attr("opacity", initialOpacity)
          type.attr("data-extra", "1").attr("opacity", initialOpacity)
          if (display === "none") { row.style("display", "none"); name.style("display", "none"); type.style("display", "none") }
        }
      })
    })

    return gTable
  }
}


