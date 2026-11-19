import { defineConfig } from 'vite'
export default defineConfig({
  base: './',
  build:{
    rollupOptions:{
      output:{
        manualChunks(id) {
          if(id.includes('/node_modules/@dimforge/rapier3d-compat/')) return 'rapier'
          if(id.includes('/node_modules/three/src/') || id.includes('/node_modules/three/build/')) return 'three'
        },
      },
    },
  },
})

