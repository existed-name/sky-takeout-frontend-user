import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// Vite 配置运行在 Node 环境，读环境变量必须用 loadEnv，不能用 import.meta.env。
export default defineConfig(({ mode }) => {
  // 只取 VITE_ 前缀的变量；三者都有代码内默认值，因此不写任何 .env 文件也能 dev / build。
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const base = env.VITE_APP_BASE || '/'
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://localhost:8080'

  // /user 前缀整体转发到后端，不做任何路径重写（后端所有端点都在 /user/** 下）。
  const proxy = {
    '/user': {
      target: proxyTarget,
      changeOrigin: true
    }
  }

  return {
    base,
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      port: 8090,
      proxy
    },
    preview: {
      port: 8090,
      proxy
    }
  }
})
