import { defineConfig } from 'vite';

// Vite is the little web server that runs your game while you work on it.
// You usually do not need to change anything here.
export default defineConfig({
    server: {
        // Keep the browser closed on start; open http://localhost:5173 manually.
        open: false,
    },
});
