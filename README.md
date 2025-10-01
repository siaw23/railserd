## Rails schema.rb → Interactive ERD

RailsERD is a small Rails app that turns your schema.rb into an interactive Entity‑Relationship Diagram (ERD). Paste your schema on the left and get a zoomable, pannable graph on the right with smart routing, highlighting, search, and compact views for wide tables.

### Features
- Zoom, pan and drag tables to arrange your diagram
- Click a table to highlight its connected tables
- Use the “Highlight Depth” control to show hops
- Search to bring a model into focus
- Press "Compact 3+" to collapse tables with > 3 columns

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
- Client: `erd_controller.js` orchestrates rendering with helpers:
  - `geometry.js`: sizing and paths
  - `table_renderer.js`: draws tables
  - `link_renderer.js`: draws links and updates on movement
  - `layout_manager.js`: layout, routing, and path updates
  - `highlight_manager.js`: selection, depth, and dimming
- Server: `SchemaToGraph` parses schema.rb and returns `{ nodes, links }`.

## License
MIT
