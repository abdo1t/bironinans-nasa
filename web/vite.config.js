import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Real and mock data bundles live in different public dirs, so a build contains
// exactly one of them:
//   npm run dev / build          -> public/       (real data, manifest kind "real")
//   npm run dev:mock / build:mock -> public-mock/ (synthetic demo, kind "mock")
// useBundle.js additionally refuses a manifest whose kind does not match the mode.
// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  publicDir: mode === 'mock' ? 'public-mock' : 'public',
}))
