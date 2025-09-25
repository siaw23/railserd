class ApplicationController < ActionController::Base
  # Block mobile and tablet devices unless explicitly overridden with ?desktop=1
  before_action :block_mobile_devices

  # Using default caching; custom ETag disabled to avoid FrozenError during deploy

  private

  MOBILE_UA = /android|iphone|ipod|ipad|iemobile|windows phone|blackberry|bb10|silk|opera mini|mobile/i.freeze

  def block_mobile_devices
    return if params[:desktop] == "1"
    ua = request.user_agent.to_s
    if ua.match?(MOBILE_UA)
      render "shared/desktop_only", layout: false, status: :ok
    end
  end
end
