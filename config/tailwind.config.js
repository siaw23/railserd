// Minimal Tailwind config for the tailwindcss:build task during Docker builds
module.exports = {
  content: [
    "./app/views/**/*.{erb,html}",
    "./app/helpers/**/*.rb",
    "./app/assets/stylesheets/**/*.css",
    "./app/assets/tailwind/**/*.css",
    "./app/javascript/**/*.{js,ts}",
  ],
  theme: { extend: {} },
  plugins: [],
}


