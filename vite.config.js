import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                team: resolve(__dirname, 'team.html'),
                member: resolve(__dirname, 'member.html'),
                admin: resolve(__dirname, 'admin.html'),
            },
        },
    },
})

