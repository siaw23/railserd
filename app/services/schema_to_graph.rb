require "set"

class SchemaToGraph
  def self.call(schema_rb) = new(schema_rb).call

  def initialize(schema_rb)
    @schema_rb = schema_rb
    @tables = {} # { "users" => { columns:[{name:,type:}], x:,y: } }
    @fks    = [] # [{ from:"products", to:"merchants", column:"merchant_id" }]
    @unique_fk_cols = Set.new # Set of [table, column] that are uniquely indexed
  end

  def call
    begin
      evaluate_schema_simple!
    rescue => _
      # Fallback to eval-based shim if simple parser misses features
      evaluate_schema!
    end

    # Heuristic FK inference: if a table contains a column named *_id and a
    # table with that pluralized name exists, assume an association unless a
    # concrete foreign key was already captured. This makes plain schemas work
    # even without explicit `foreign_key: true` or add_foreign_key statements.
    infer_foreign_keys_from_columns!
    # Filter out infrastructure tables we don't want to render
    nodes = @tables
      .reject { |name, _| excluded_table?(name) }
      .map { |name, t| { id: name, fields: t[:columns].map { |c| [c[:name], c[:type]] } } }

    # Convert FK to 1:* by default (from = many, to = one). If the foreign key column
    # on the referencing table has a UNIQUE index, treat it as 1:1.
    # Also drop any link that touches excluded tables
    links = @fks
      .reject { |fk| excluded_table?(fk[:from]) || excluded_table?(fk[:to]) }
      .map { |fk|
        inferred_col = fk[:column] || "#{fk[:to].to_s.singularize}_id"
        one_to_one = @unique_fk_cols.include?([fk[:from], inferred_col])
        { from: fk[:from], to: fk[:to], fromCard: (one_to_one ? "1" : "many"), toCard: "1" }
      }
      .uniq

    # Compute a deterministic server-side layout so the client doesn't have to
    layout_nodes!(nodes, links)

    { nodes: nodes, links: links }
  end

  private

  # Returns true when a table should be hidden from the ERD
  def excluded_table?(table_name)
    return false if table_name.nil?
    # Explicit Active Storage tables, plus a conservative prefix check for future tables
    return true if table_name.start_with?("active_storage_")
    false
  end

  def evaluate_schema!
    require "active_support/core_ext/string/inflections"
    shim = Shim.new(@tables, @fks)
    sanitized = sanitize_schema(@schema_rb.to_s)
    code = <<~RUBY
      module ActiveRecord; module Schema; end; end
      module ActiveRecord::Schema
        def self.[](*) = self
        def self.define(*); yield if block_given?; end
      end
      #{shim.dsl}
      #{ sanitized }
    RUBY
    TOPLEVEL_BINDING.eval(code)
  end

  # Lightweight, safe line parser that handles common schema.rb constructs without eval
  def evaluate_schema_simple!
    current_table = nil
    @schema_rb.each_line do |raw|
      line = raw.strip
      next if line.empty?

      if m = line.match(/^create_table\s+\"([^\"]+)\"/)
        current_table = m[1]
        @tables[current_table] ||= { columns: [] }
        next
      end

      if current_table
        if line == 'end'
          current_table = nil
          next
        end

        # Support both symbol and string column names, e.g.:
        # t.references :user, foreign_key: true
        # t.references "user", foreign_key: true
        if (m = line.match(/^t\.(\w+)\s+(?::([a-zA-Z_]\w*)|\"([^\"]+)\")/))
          meth = m[1]
          col  = m[2] || m[3]
          case meth
          when 'references', 'belongs_to'
            @tables[current_table][:columns] << { name: "#{col}_id", type: 'int' }
            @fks << { from: current_table, to: col.pluralize, column: "#{col}_id" } if line.include?('foreign_key: true')
          when 'timestamps'
            @tables[current_table][:columns] << { name: 'created_at', type: 'datetime' }
            @tables[current_table][:columns] << { name: 'updated_at', type: 'datetime' }
          else
            @tables[current_table][:columns] << { name: col, type: meth }
          end
          next
        end

        # Capture unique indexes on single columns (t.index ... unique: true)
        # Only treat as single-column unique index (ignore composite indexes like ["a", "b"])
        if line.match(/^t\.index\s+/) && line.include?("unique: true")
          # Try to extract bracket list first
          if (mb = line.match(/\[(.*?)\]/))
            cols = mb[1].scan(/\"([^\"]+)\"/).flatten
            if cols.length == 1
              @unique_fk_cols << [current_table, cols.first]
              next
            end
          end
          # Fallback to single string argument form
          if (m1 = line.match(/^t\.index\s+\"([^\"]+)\"/))
            @unique_fk_cols << [current_table, m1[1]]
            next
          end
          next
        end
      end

      if m = line.match(/^add_foreign_key\s+\"([^\"]+)\",\s*\"([^\"]+)\"/)
        @fks << { from: m[1], to: m[2], column: nil }
        next
      end

      # Capture add_index ... unique: true outside table blocks
      # add_index table, ..., unique: true (ignore composite arrays unless single col)
      if line.match(/^add_index\s+/) && line.include?("unique: true")
        if (mb = line.match(/^add_index\s+\"([^\"]+)\",\s*\[(.*?)\]/))
          tbl = mb[1]
          cols = mb[2].scan(/\"([^\"]+)\"/).flatten
          if cols.length == 1
            @unique_fk_cols << [tbl, cols.first]
          end
          next
        elsif (m = line.match(/^add_index\s+\"([^\"]+)\",\s*\"([^\"]+)\"/))
          tbl = m[1]
          col = m[2]
          @unique_fk_cols << [tbl, col]
          next
        end
        next
      end
    end
  end

  # Infer missing foreign keys from *_id columns
  def infer_foreign_keys_from_columns!
    require "active_support/core_ext/string/inflections"
    existing = Set.new(@fks.map { |fk| [fk[:from], fk[:to]] })
    table_names = @tables.keys.to_set
    @tables.each do |from_tbl, t|
      next unless t && t[:columns]
      t[:columns].each do |col|
        name = col[:name].to_s
        next unless name.end_with?("_id") && name.size > 3
        base = name.sub(/_id\z/, "")
        to_tbl = base.pluralize
        next unless table_names.include?(to_tbl)
        pair = [from_tbl, to_tbl]
        next if existing.include?(pair)
        @fks << { from: from_tbl, to: to_tbl, column: name }
        existing << pair
      end
    end
  end

  def sanitize_schema(str)
    # Normalize AR 7/8 bracket syntax
    s = str.gsub(/ActiveRecord::Schema\[[^\]]*\]/, 'ActiveRecord::Schema')
    # Remove entire index/check_constraint statements (we don't need them for ERD)
    s = s.each_line.reject { |ln|
      t = ln.lstrip
      t.start_with?("t.index", "add_index", "t.check_constraint", "check_constraint")
    }.join
    s
  end

  # --- Simple, fast layout to offload heavy work from the browser ---------------------------
  def layout_nodes!(nodes, links)
    return if nodes.empty?

    # Estimate box sizes similar to the JS renderer (keep numbers in sync if updated there)
    padx = 16.0
    row_h = 26.0
    hdr_h = 30.0
    type_w = 82.0
    min_w = 240.0

    nodes.each do |n|
      max_name = n[:fields].map { |f| (f[0] || '').to_s.length }.max || 2
      name_w = [max_name, 2].max * 7.2
      n[:w] = [min_w, padx * 2 + name_w + type_w].max
      n[:h] = hdr_h + (n[:fields].length * row_h)
    end

    # Golden-angle (phyllotaxis) spiral layout: evenly spread in all directions
    golden = 2.399963229728653
    avg_dim = nodes.map { |n| [n[:w], n[:h]].max }.sum / [nodes.length, 1].max
    c = (avg_dim * 0.6) + 60.0 # radial step constant – compact but with breathing room
    nodes.each_with_index do |n, i|
      r = c * Math.sqrt(i + 1)
      ang = i * golden
      cx = Math.cos(ang) * r
      cy = Math.sin(ang) * r
      n[:x] = cx - n[:w] / 2.0
      n[:y] = cy - n[:h] / 2.0
    end

    # Spatial hashing separation to remove any residual overlaps
    padding = 24.0
    bin = (avg_dim + 40.0).to_i
    iterations = [[(Math.sqrt(nodes.length) * 2).to_i, 5].max, 12].min
    iterations.times do
      buckets = Hash.new { |h, k| h[k] = [] }
      nodes.each_with_index do |n, idx|
        gx0 = (n[:x] / bin).floor
        gy0 = (n[:y] / bin).floor
        gx1 = ((n[:x] + n[:w]) / bin).floor
        gy1 = ((n[:y] + n[:h]) / bin).floor
        (gy0..gy1).each { |gy| (gx0..gx1).each { |gx| buckets[[gx, gy]] << idx } }
      end

      moved = false
      nodes.each_with_index do |a, i|
        gx0 = (a[:x] / bin).floor
        gy0 = (a[:y] / bin).floor
        (gy0 - 1..gy0 + 1).each do |gy|
          (gx0 - 1..gx0 + 1).each do |gx|
            (buckets[[gx, gy]] || []).each do |j|
              next if j <= i
              b = nodes[j]
              next unless rects_overlap?(a, b, padding)
              ax = a[:x] + a[:w] / 2.0
              ay = a[:y] + a[:h] / 2.0
              bx = b[:x] + b[:w] / 2.0
              by = b[:y] + b[:h] / 2.0
              dx = ax - bx
              dy = ay - by
              dx = 0.01 if dx.zero? && dy.zero?
              len = Math.sqrt(dx * dx + dy * dy)
              push = 8.0
              ux = dx / len * push
              uy = dy / len * push
              a[:x] += ux
              a[:y] += uy
              b[:x] -= ux
              b[:y] -= uy
              moved = true
            end
          end
        end
      end
      break unless moved
    end

    # Normalize to positive space with outer margin
    min_x = nodes.map { |n| n[:x] }.min
    min_y = nodes.map { |n| n[:y] }.min
    margin = 120.0
    dx = margin - min_x
    dy = margin - min_y
    nodes.each do |n|
      n[:x] = (n[:x] + dx).round(2)
      n[:y] = (n[:y] + dy).round(2)
      n.delete(:w)
      n.delete(:h)
    end

    # Normalize to positive space with outer margin
    min_x = nodes.map { |n| n[:x] }.min
    min_y = nodes.map { |n| n[:y] }.min
    margin = 200.0
    dx = margin - min_x
    dy = margin - min_y
    nodes.each do |n|
      n[:x] = (n[:x] + dx).round(2)
      n[:y] = (n[:y] + dy).round(2)
      # Drop server size hints; client recomputes precise w/h for its fonts
      n.delete(:w)
      n.delete(:h)
    end
  end

  def rects_overlap?(a, b, padding)
    !(a[:x] + a[:w] + padding <= b[:x] ||
      b[:x] + b[:w] + padding <= a[:x] ||
      a[:y] + a[:h] + padding <= b[:y] ||
      b[:y] + b[:h] + padding <= a[:y])
  end

  # The DSL shim that captures create_table/t.*/add_foreign_key
  class Shim
    def initialize(tables, fks) = (@tables, @fks = tables, fks)

    def dsl
      <<~RUBY
        def create_table(name, **opts)
          tbl = { columns: [] }
          $__ERD_TABLES__[name.to_s] = tbl
          builder = TableBuilder.new(name.to_s, tbl)
          yield builder if block_given?
          tbl
        end

        # No-op helpers commonly present in schema.rb
        def enable_extension(*); end
        def disable_extension(*); end
        def add_index(*); end
        def create_join_table(*); end
        def execute(*); end
        def create_enum(*); end
        # Tolerate stray keyword-like calls if sanitizer misses them
        def name(*); end

        def add_foreign_key(from_table, to_table, **opts)
          $__ERD_FKS__ << {
            from: from_table.to_s,
            to:   to_table.to_s,
            column: opts[:column]&.to_s
          }
        end

        # Swallow any stray/unknown top-level calls (e.g., if sanitizer leaves fragments)
        def method_missing(meth, *args, **kw, &blk)
          nil
        end

        def respond_to_missing?(meth, include_private=false)
          true
        end

        class TableBuilder
          def initialize(name, tbl) = (@name, @tbl = name, tbl)
          def column(name, type, **_)    = @tbl[:columns] << { name: name.to_s, type: type.to_s }
          def string(name, **_)          = column(name, :varchar)
          def text(name, **_)            = column(name, :text)
          def integer(name, **_)         = column(name, :int)
          def bigint(name, **_)          = column(name, :int)
          def float(name, **_)           = column(name, :float)
          def decimal(name, **_)         = column(name, :decimal)
          def boolean(name, **_)         = column(name, :boolean)
          def date(name, **_)            = column(name, :date)
          def datetime(name, **_)        = column(name, :datetime)
          def timestamp(name, **_)       = column(name, :timestamp)
          def time(name, **_)            = column(name, :time)
          def json(name, **_)            = column(name, :json)
          def jsonb(name, **_)           = column(name, :jsonb)
          def uuid(name, **_)            = column(name, :uuid)
          def binary(name, **_)          = column(name, :binary)

          # t.references :user, foreign_key: true
          def references(name, **opts)
            column("#{name}_id", :int)
            if opts[:foreign_key]
              $__ERD_FKS__ << { from: @name, to: name.to_s.pluralize, column: "#{name}_id" }
            end
          end
          alias belongs_to references

          # t.timestamps
          def timestamps(*)
            column("created_at", :datetime)
            column("updated_at", :datetime)
          end

          # no-op schema helpers
          def index(*args, **kwargs); end
          def check_constraint(*args, **kwargs); end
        end

        $__ERD_TABLES__ = ObjectSpace._id2ref(#{@tables.object_id})
        $__ERD_FKS__    = ObjectSpace._id2ref(#{@fks.object_id})
      RUBY
    end
  end
end


