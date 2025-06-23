import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path';
export default defineConfig({
  base: './',
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, "src"),
      // '#minpath': resolve(__dirname, 'node_modules/vfile/lib/minpath.js')
    },
  },
  server: {
    host: true,
    port: 3000,    //设置服务启动端口
    open: false,    //设置服务启动时是否自动打开浏览器
    cors: true,    //允许跨域
  }
})
