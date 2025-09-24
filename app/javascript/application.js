// Configure your import map in config/importmap.rb. Read more: https://github.com/rails/importmap-rails
import "@hotwired/turbo-rails"
import "controllers"
import { createIcons, FileText } from "lucide"

document.addEventListener("turbo:load", () => {
  try {
    createIcons({ icons: { FileText } })
  } catch (e) { /* ignore if not on page */ }
})
