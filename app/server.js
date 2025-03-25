import { parse } from 'url'
import next from 'next'
import { createProxyMiddleware } from 'http-proxy-middleware'
import express from 'express'

const port = parseInt(process.env.PORT || '3000', 10)
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const PRIVATE_API_URL = process.env.PRIVATE_API_URL

app.prepare().then(() => {
  const server = express()

  // Proxy middleware so all API requests are proxied serverside to the API
  // This allows us to take advantage of Fly's private networking
  server.use(
    '/api',
    createProxyMiddleware({
      target: `${PRIVATE_API_URL}/api`,
      changeOrigin: true,
    })
  )

  server.all('*', (req, res) => {
    const parsedUrl = parse(req.url, true)
    return handle(req, res, parsedUrl)
  })

  server.listen(port, () => {
    console.log(
      `> Server listening at http://localhost:${port} as ${
        dev ? 'development' : process.env.NODE_ENV
      }`
    )
    console.log(`> API requests will be proxied to ${PRIVATE_API_URL}/api`)
  })
})
