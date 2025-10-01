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
end


