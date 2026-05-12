import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'

const host = process.env.PLAYWRIGHT_HOST || '127.0.0.1'
const port = Number(process.env.PLAYWRIGHT_PORT || 4173)
const root = path.join(process.cwd(), 'dist')

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath)
  response.writeHead(200, {
    'Content-Type': mimeTypes[extension] || 'application/octet-stream',
  })
  createReadStream(filePath).pipe(response)
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`)
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  let filePath = path.join(root, safePath)

  if (!filePath.startsWith(root)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(response, filePath)
    return
  }

  sendFile(response, path.join(root, 'index.html'))
})

server.listen(port, host, () => {
  console.log(`Playwright static server running at http://${host}:${port}`)
})

function shutdown() {
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
