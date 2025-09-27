import "@hotwired/turbo-rails"
import "./controllers"
import { createIcons, FileText } from "lucide"
import * as monaco from "monaco-editor"

function currentSchemaVersion() {
  const n = new Date()
  const pad = (x, l=2) => String(x).padStart(l, "0")
  const yyyy = n.getFullYear()
  const mm = pad(n.getMonth() + 1)
  const dd = pad(n.getDate())
  const HH = pad(n.getHours())
  const MM = pad(n.getMinutes())
  const SS = pad(n.getSeconds())
  return `${yyyy}_${mm}_${dd}_${HH}${MM}${SS}`
}

document.addEventListener("turbo:load", () => {
  try { createIcons({ icons: { FileText } }) } catch {}

  const leftPane = document.querySelector('[data-erd-target="leftPane"]')
  const textarea = leftPane && leftPane.querySelector('[data-erd-target="input"]')
  if (!leftPane || !textarea) return

  const container = document.createElement("div")
  container.style.position = "absolute"
  container.style.inset = "0px"
  container.style.height = "100%"
  container.style.width = "100%"
  const parent = textarea.parentElement
  parent.style.position = "relative"
  parent.appendChild(container)
  textarea.style.display = "none"

  // Default monospace stack
  const fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

  const version = currentSchemaVersion()
  const defaultSample = `# +----------------------------------------------+
# | Senior Ruby on Rails Consultant.             |
# | 11 years of experience.                      |
# | Open to freelance & contract engagements.    |
# | Let's talk: mensah.consultancy@gmail.com     |
# | X | LinkedIn | Github | YouTube: siaw23      |
# +----------------------------------------------+
#
# This app uses no database and does not store your schema.
# No sessions, no persistence.
# Your schema.rb remains private.
#
# Paste your schema.rb content in this pane.
#
# Tips:
# – Zoom, pan and drag tables to arrange your diagram.
# – Click a table to highlight its connected tables.
# – Use the “Highlight Depth” control to show 1, 2, 3, or all
#   hops.

ActiveRecord::Schema.define(version: ${version}) do
  create_table "users", force: :cascade do |t|
    t.string "email", null: false
    t.string "name"
    t.timestamps
  end

  create_table "posts", force: :cascade do |t|
    t.string "title"
    t.text "content"
    t.references "user", foreign_key: true
    t.timestamps
  end
end`

  const initialValue = (textarea.value && textarea.value.trim().length > 0) ? textarea.value : defaultSample
  const editor = monaco.editor.create(container, {
    value: initialValue,
    language: "ruby",
    theme: "vs-dark",
    fontFamily: fontFamily,
    fontSize: 13,
    lineHeight: 22,
    minimap: { enabled: false },
    wordWrap: "on",
    automaticLayout: true,
    scrollBeyondLastLine: false,
    tabSize: 2
  })

  // Place cursor at the end and focus editor
  const model = editor.getModel()
  if (model) {
    const lineNumber = model.getLineCount()
    const column = model.getLineMaxColumn(lineNumber)
    editor.setPosition({ lineNumber, column })
    editor.revealPositionInCenter({ lineNumber, column })
    editor.focus()
  }

  const syncToTextarea = () => {
    textarea.value = editor.getValue()
    // Fire input event so Stimulus debouncedParse runs (live preview)
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
  }
  editor.onDidChangeModelContent(syncToTextarea)
  // Kick off initial render
  syncToTextarea()
})
