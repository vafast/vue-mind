import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueMind from '@vue-mind/vite-plugin'

export default defineConfig({
  plugins: [
    vue(),
    vueMind(),
  ],
})
