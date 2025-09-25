class ApplicationController < ActionController::Base
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  # Simple ETag based on app assets version to support HTTP caching
  etag { Rails.application.config.assets.version }
end
