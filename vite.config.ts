/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    // react-plotly.js internally requires 'plotly.js/dist/plotly'.
    // Redirect that to the plotly.js-dist-min bundle (the only Plotly build installed).
    alias: {
      'plotly.js/dist/plotly': resolve('node_modules/plotly.js-dist-min/plotly.min.js'),
    },
  },
  optimizeDeps: {
    include: ['react-plotly.js', 'plotly.js-dist-min'],
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
