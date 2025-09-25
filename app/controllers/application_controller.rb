class ApplicationController < ActionController::Base
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  # ETag based on assets version; ensure it's a mutable string to avoid FrozenError
  etag { "assets:v#{Rails.application.config.assets.version || '0'}".dup }
end
