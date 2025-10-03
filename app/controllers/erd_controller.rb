require "base64"
require "zlib"
require "json"
require "digest"

class ErdController < ApplicationController
  protect_from_forgery with: :exception

  def index
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
      if parsed.is_a?(Hash) && parsed["nodes"].is_a?(Array) && parsed["links"].is_a?(Array)
        @initial_graph = parsed
      end
    rescue => _e
      @initial_graph = nil
    end
    render :index
  end

  def shorten_schema
    payload = params[:payload].to_s
    if payload.blank?
      render json: { error: "missing_payload" }, status: :unprocessable_entity
      return
    end
    code = Digest::SHA256.hexdigest(payload)[0, 20]
    Rails.cache.write(cache_key_for_schema(code), payload, expires_in: 48.hours)
    url = erd_schema_short_url(code: code)
    render json: { url: url }
  end

  def schema
    payload = Rails.cache.read(cache_key_for_schema(params[:code].to_s))
    if payload.blank?
      redirect_to(root_path, alert: "Link expired") and return
    end
    begin
      schema_str = inflate_from_b64url(payload)
      @initial_schema = schema_str.force_encoding("UTF-8")
      graph = SchemaToGraph.call(@initial_schema)
      graph[:nodes] ||= []
      graph[:links] ||= []
      @initial_graph = graph
    rescue => _e
      @initial_schema = nil
      @initial_graph = nil
    end
    render :index
  end

  private

  def cache_key_for(code)
    "erd:share:#{code}"
  end

  def cache_key_for_schema(code)
    "erd:share_schema:#{code}"
  end

  def inflate_from_b64url(b64url)
    raw = Base64.urlsafe_decode64(b64url)
    Zlib::Inflate.new(-Zlib::MAX_WBITS).inflate(raw)
  end
end


