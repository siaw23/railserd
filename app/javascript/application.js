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
# Tips:
# • Zoom, pan and drag tables to arrange your diagram.
# • Click a table to highlight its connected tables.
# • Use the “Highlight Depth” control to show hops.
# • Search to bring a model into focus.
# • Press "Compact 3+" to collapse tables
#   with > 3 columns.
#
# Paste your schema.rb content in this pane.

ActiveRecord::Schema.define(version: ${version}) do

  create_table "users", force: :cascade do |t|
    t.string   "email",             null: false
    t.string   "username",          null: false
    t.string   "name"
    t.string   "password_digest"
    t.integer  "role",              null: false, default: 0
    t.datetime "confirmed_at"
    t.datetime "last_seen_at"
    t.string   "locale",            default: "en"
    t.string   "time_zone",         default: "UTC"
    t.jsonb    "settings",          null: false, default: {}
    t.datetime "deleted_at"
    t.timestamps
  end

  create_table "posts", force: :cascade do |t|
    t.string   "title",             null: false
    t.text     "content"
    t.references "user",            null: false, foreign_key: true
    t.string   "slug",              null: false
    t.integer  "status",            null: false, default: 0
    t.integer  "visibility",        null: false, default: 0
    t.datetime "published_at"
    t.boolean  "pinned",            null: false, default: false
    t.integer  "comments_count",    null: false, default: 0
    t.integer  "reactions_count",   null: false, default: 0
    t.datetime "deleted_at"
    t.timestamps
  end

  create_table "comments", force: :cascade do |t|
    t.references "post",            null: false, foreign_key: true
    t.references "user",            null: false, foreign_key: true
    t.text     "body",              null: false
    t.bigint   "parent_id"
    t.integer  "depth",             null: false, default: 0
    t.integer  "reactions_count",   null: false, default: 0
    t.datetime "edited_at"
    t.datetime "deleted_at"
    t.timestamps
  end

  add_index "comments", ["post_id"],    name: "index_comments_on_post_id"
  add_index "comments", ["user_id"],    name: "index_comments_on_user_id"
  add_index "comments", ["parent_id"],  name: "index_comments_on_parent_id"
  add_foreign_key "comments", "comments", column: "parent_id"

  create_table "reactions", force: :cascade do |t|
    t.references "user", null: false, foreign_key: true
    t.string     "reactable_type",  null: false
    t.bigint     "reactable_id",    null: false
    t.integer    "kind",            null: false, default: 0
    t.timestamps
  end

  create_table "follows", force: :cascade do |t|
    t.bigint    "follower_id",      null: false
    t.bigint    "followed_id",      null: false
    t.datetime  "created_at",       null: false
  end

  add_foreign_key "follows", "users", column: "follower_id"
  add_foreign_key "follows", "users", column: "followed_id"

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

  // Place cursor at the end but keep scroll at the top on load
  const model = editor.getModel()
  if (model) {
    const lineNumber = model.getLineCount()
    const column = model.getLineMaxColumn(lineNumber)
    editor.setPosition({ lineNumber, column })
    // Keep initial scroll at the very top to show content from the beginning
    requestAnimationFrame(() => {
      try { editor.setScrollTop(0) } catch {}
    })
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
