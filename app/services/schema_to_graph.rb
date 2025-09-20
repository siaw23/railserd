class SchemaToGraph
  def self.call(schema_rb) = new(schema_rb).call

  def initialize(schema_rb)
    @schema_rb = schema_rb
    @tables = {} # { "users" => { columns:[{name:,type:}], x:,y: } }
    @fks    = [] # [{ from:"products", to:"merchants", column:"merchant_id" }]
  end

  def call
    begin
      evaluate_schema_simple!
    rescue => _
      # Fallback to eval-based shim if simple parser misses features
      evaluate_schema!
    end
    nodes = @tables.map do |name, t|
      {
        id: name,
        # you can seed positions if you like; omitted = auto initial layout on load
        fields: t[:columns].map { |c| [c[:name], c[:type]] }
      }
    end

    # Convert FK to 1:* (from = many, to = one)
    links = @fks.map { |fk| { from: fk[:from], to: fk[:to], fromCard: "many", toCard: "1" } }.uniq

    { nodes: nodes, links: links }
  end

  private

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

        if (m = line.match(/^t\.(\w+)\s+\"([^\"]+)\"/))
          meth = m[1]
          col  = m[2]
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
      end

      if m = line.match(/^add_foreign_key\s+\"([^\"]+)\",\s*\"([^\"]+)\"/)
        @fks << { from: m[1], to: m[2], column: nil }
        next
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


