/**
 * LinkColorManager - Manages color assignments for ERD relationship links
 */
export class LinkColorManager {
  constructor(options = {}) {
    this.palette = options.palette || this._getDefaultPalette()
    this.colorAssignments = new Map()
    this.nextColorIndex = 0
  }

  /**
   * Default color palette - vibrant, accessible colors
   * @private
   */
  _getDefaultPalette() {
    return [
      "#ef4444", // red-500
      "#3b82f6", // blue-500
      "#10b981", // emerald-500
      "#f59e0b", // amber-500
      "#8b5cf6", // violet-500
      "#ec4899", // pink-500
      "#06b6d4", // cyan-500
      "#14b8a6", // teal-500
      "#84cc16", // lime-500
      "#e11d48", // rose-600
      "#0ea5e9", // sky-500
      "#22c55e", // green-500
      "#a855f7", // purple-500
      "#f43f5e", // rose-500
      "#f97316", // orange-500
      "#eab308", // yellow-500
      "#38bdf8", // sky-400
      "#34d399", // emerald-400
      "#60a5fa", // blue-400
      "#a3e635", // lime-400
      "#fb923c", // orange-400
      "#c084fc", // purple-400
      "#fbbf24", // amber-400
      "#4ade80"  // green-400
    ]
  }

  /**
   * Get a color for a specific link index
   * @param {number} index - The index of the link
   * @returns {string} Hex color code
   */
  getColorByIndex(index) {
    return this.palette[index % this.palette.length]
  }

  /**
   * Get a color for a link by its relationship key
   * @param {string} key - Unique identifier for the relationship (e.g., "users->posts")
   * @returns {string} Hex color code
   */
  getColorByKey(key) {
    if (this.colorAssignments.has(key)) {
      return this.colorAssignments.get(key)
    }

    const color = this.palette[this.nextColorIndex % this.palette.length]
    this.colorAssignments.set(key, color)
    this.nextColorIndex++
    return color
  }

  /**
   * Assign colors to an array of links based on their index
   * @param {Array} links - Array of link objects
   * @returns {Array} Links with color property added
   */
  assignColorsByIndex(links) {
    return links.map((link, index) => ({
      ...link,
      color: this.getColorByIndex(index)
    }))
  }

  /**
   * Assign colors to links based on relationship pairs
   * Ensures same relationship always gets same color
   * @param {Array} links - Array of link objects with 'from' and 'to' properties
   * @returns {Array} Links with color property added
   */
  assignColorsByRelationship(links) {
    return links.map((link) => {
      const key = `${link.from}->${link.to}`
      return {
        ...link,
        color: this.getColorByKey(key)
      }
    })
  }

  /**
   * Reset all color assignments
   */
  reset() {
    this.colorAssignments.clear()
    this.nextColorIndex = 0
  }

  /**
   * Set a custom color palette
   * @param {Array<string>} palette - Array of hex color codes
   */
  setPalette(palette) {
    if (!Array.isArray(palette) || palette.length === 0) {
      throw new Error("Palette must be a non-empty array of color codes")
    }
    this.palette = palette
    this.reset()
  }

  /**
   * Get the current palette
   * @returns {Array<string>} Array of hex color codes
   */
  getPalette() {
    return [...this.palette]
  }

  /**
   * Get the number of colors in the palette
   * @returns {number}
   */
  getPaletteSize() {
    return this.palette.length
  }

  /**
   * Generate a random color (for dynamic scenarios)
   * @returns {string} Hex color code
   */
  getRandomColor() {
    return this.palette[Math.floor(Math.random() * this.palette.length)]
  }

  /**
   * Predefined color schemes
   */
  static ColorSchemes = {
    DEFAULT: "default",
    PASTEL: "pastel",
    MONOCHROME: "monochrome",
    BOLD: "bold"
  }

  /**
   * Apply a predefined color scheme
   * @param {string} scheme - One of LinkColorManager.ColorSchemes
   */
  applyScheme(scheme) {
    switch (scheme) {
      case LinkColorManager.ColorSchemes.PASTEL:
        this.setPalette([
          "#fbb6ce", "#fbd38d", "#bee3f8", "#c6f6d5", "#e9d8fd",
          "#fecaca", "#fed7aa", "#a5f3fc", "#bbf7d0", "#ddd6fe"
        ])
        break
      case LinkColorManager.ColorSchemes.MONOCHROME:
        this.setPalette([
          "#1f2937", "#374151", "#4b5563", "#6b7280", "#9ca3af",
          "#d1d5db", "#e5e7eb", "#f3f4f6", "#3b82f6", "#60a5fa"
        ])
        break
      case LinkColorManager.ColorSchemes.BOLD:
        this.setPalette([
          "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0284c7",
          "#7c3aed", "#c026d3", "#be123c", "#0891b2", "#4f46e5"
        ])
        break
      case LinkColorManager.ColorSchemes.DEFAULT:
      default:
        this.setPalette(this._getDefaultPalette())
        break
    }
  }
}


