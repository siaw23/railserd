module ApplicationHelper
  def meta_title
    content_for(:title).presence || "Rails ERD Generator"
  end

  def meta_description
    content_for(:description).presence || "Interactive Rails ERD generator. Paste schema.rb, get an entity relationship diagram."
  end

  def meta_image_url
    asset_url("railserd_com_transform_schema_rb_to_erd.png")
  end

  def meta_url
    request.original_url
  end
end
