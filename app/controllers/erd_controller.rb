require "base64"
require "zlib"
require "json"
require "digest"

class ErdController < ApplicationController
  protect_from_forgery with: :exception

  def index
    @initial_schema ||= default_sample_schema
  end

  def parse
    schema = params[:schema].to_s
    graph = SchemaToGraph.call(schema)

    graph[:nodes] ||= []
    graph[:links] ||= []
    render json: graph
  rescue => e
    render json: { error: e.class.name, message: e.message, backtrace: Rails.env.development? ? e.backtrace.first(3) : nil }, status: :unprocessable_entity
  end

  def shorten
    payload = params[:payload].to_s
    if payload.blank?
      render json: { error: "missing_payload" }, status: :unprocessable_entity
      return
    end

    code = Digest::SHA256.hexdigest(payload)[0, 20]
    Rails.cache.write(cache_key_for(code), payload, expires_in: 48.hours)
    url = erd_short_url(code: code)
    render json: { url: url }
  end

  def go
    payload = Rails.cache.read(cache_key_for(params[:code].to_s))
    if payload.blank?
      redirect_to(root_path, alert: "Link expired") and return
    end
    begin
      json = inflate_from_b64url(payload)
      parsed = JSON.parse(json)
      if parsed.is_a?(Hash) && parsed.key?("graph")
        @initial_graph = parsed["graph"] || {}
        @initial_schema = parsed["schema"].to_s if parsed.key?("schema")
      elsif parsed.is_a?(Hash) && parsed["nodes"].is_a?(Array) && parsed["links"].is_a?(Array)
        @initial_graph = parsed
      end
    rescue => _e
      @initial_graph = nil
    end
    render :index
  end

  private

  def cache_key_for(code)
    "erd:share:#{code}"
  end

  def inflate_from_b64url(b64url)
    raw = Base64.urlsafe_decode64(b64url)
    Zlib::Inflate.new(-Zlib::MAX_WBITS).inflate(raw)
  end

  def default_sample_schema
    version = Time.now.strftime("%Y_%m_%d_%H%M%S")
    <<~RUBY
      # +----------------------------------------------+
      # | Senior Ruby on Rails Consultant.             |
      # | 11 years of experience.                      |
      # | Open to freelance & contract engagements.    |
      # | Let's talk: mensah.consultancy@gmail.com     |
      # | X | LinkedIn | Github | YouTube: siaw23      |
      # +----------------------------------------------+
      #
      # This app uses no database and does not store your schema.
      # No sessions. Shared links are cached for 48 hours.
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

      ActiveRecord::Schema.define(version: #{version}) do
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
          t.string     "title",             null: false
          t.text       "content"
          t.references "user",              null: false, foreign_key: true
          t.string     "slug",              null: false
          t.integer    "status",            null: false, default: 0
          t.integer    "visibility",        null: false, default: 0
          t.datetime   "published_at"
          t.boolean    "pinned",            null: false, default: false
          t.integer    "comments_count",    null: false, default: 0
          t.integer    "reactions_count",   null: false, default: 0
          t.datetime   "deleted_at"
          t.timestamps
        end

        create_table "comments", force: :cascade do |t|
          t.references "post",              null: false, foreign_key: true
          t.references "user",              null: false, foreign_key: true
          t.text       "body",              null: false
          t.bigint     "parent_id"
          t.integer    "depth",             null: false, default: 0
          t.integer    "reactions_count",   null: false, default: 0
          t.datetime   "edited_at"
          t.datetime   "deleted_at"
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
      end
    RUBY
  end
end


