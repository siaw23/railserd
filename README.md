## Rails schema.rb → Interactive ERD

RailsERD turns your schema.rb into an interactive ERD. Paste your schema on the left and explore a zoomable diagram on the right with smart routing, highlighting, search, and compact views.

### Features
- Zoom, pan, and drag tables
- Click a table to highlight its neighbors
- Choose “Highlight Depth” to control hops
- Search to jump a model into focus
- “Compact 3+” collapses long tables

### Tech
- Rails + Stimulus
- D3 for SVG rendering and interactions
- Esbuild bundling; Tailwind for styling

### Development
```bash
bin/setup
bin/dev
```
Open http://localhost:3000. The ERD lives at `/` and `/erd`.

### How it works
- Client: `app/javascript/controllers/*`
  - `erd_controller.js`: coordinates the UI. Boots layers, parses, renders, and delegates to managers (pane, compaction, search, highlight, canvas, viewport).
  - `canvas_manager.js`: creates/clears SVG groups (root/link/label/table) and sets the initial viewport. Provides `reset()` before render.
  - `pane_manager.js`: shows/hides the left pane with transitions, updates toggle icons, and persists state in `localStorage`.
  - `compaction_manager.js`: toggles Compact 3+. Animates table height and hides/shows extra rows while keeping links in sync.
  - `search_manager.js`: debounced search. Dims non-matches and pans to the match via `ZoomManager`.
  - `highlight_manager.js`: click to select. Computes a reachable subgraph by depth and dims the rest. Syncs depth buttons.
  - `viewport_fit.js`: computes reserved space (depth controls) and calls `zoomManager.fitToViewport` with padding.
  - `zoom_manager.js`: zoom/pan controls, fit-to-bounds, and pan-to-point.
  - `layout_manager.js`: force layout, overlap resolution, link routing, rounded paths, and label placement.
  - `geometry.js`: table sizing, text measurement, and bounds.
  - `table_renderer.js`: draws tables (outline, header, title, rows, extras) and returns the draggable selection.
  - `link_renderer.js`: draws relationship paths and cardinality labels and exposes `update()`.
  - `constants.js`: common durations, offsets, and CSS class tokens.
  - `event_utils.js`: tiny helpers to attach/detach DOM and d3 listeners.
  - `index.js`: Stimulus registration for the `erd` controller.
- Client services: `app/javascript/services/*`
  - `parse_service.js`: CSRF + request-id–guarded POST to `/erd/parse`; returns `{ cancelled, ok, data }`.
  - `share_service.js`: compresses and shortens links (`/erd/shorten`, `/erd/shorten_schema`).
- Server: `app/services/schema_to_graph.rb` parses `schema.rb` and returns `{ nodes, links }` with server-side layout hints.

## License
MIT
