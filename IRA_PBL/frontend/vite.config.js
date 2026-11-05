import { defineConfig, createLogger } from 'vite'
import react from '@vitejs/plugin-react'

const logger = createLogger()
const origError = logger.error.bind(logger)

logger.error = (msg, options) => {
  if (
    typeof msg === 'string' &&
    (msg.includes('ws proxy error') || msg.includes('ECONNRESET') || msg.includes('ECONNREFUSED'))
  ) {
    return
  }
  if (options?.error && (options.error.code === 'ECONNRESET' || options.error.code === 'ECONNREFUSED')) {
    return
  }
  origError(msg, options)
}

export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/verify': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/verify/image/ai-detect': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/chat': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err?.code === 'ECONNRESET' || err?.code === 'ECONNREFUSED' || err?.code === 'EPIPE') {
              return
            }
          })
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            socket.on('error', (err) => {
              if (err?.code === 'ECONNRESET' || err?.code === 'ECONNREFUSED' || err?.code === 'EPIPE') {
                return
              }
            })
          })
        },
      },
    },
  },
})
