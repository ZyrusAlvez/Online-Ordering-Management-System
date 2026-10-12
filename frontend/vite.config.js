import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The backend's CORS_ORIGIN expects :5173.
  server: { port: 5173, strictPort: true },
});
