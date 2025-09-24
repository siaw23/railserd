import "@hotwired/turbo-rails"
import "controllers"
import { createIcons, FileText } from "lucide"

document.addEventListener("turbo:load", () => {
  try {
    createIcons({ icons: { FileText } })
  } catch (e) { /* ignore if not on page */ }
})
