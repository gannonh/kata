/**
 * Development server with live reload for mermaid samples.
 *
 * Usage: node --import tsx packages/mermaid/dev.ts
 *
 * - Runs `index.ts` to generate index.html on startup
 * - Watches `src/` and `index.ts` for file changes
 * - On change, rebuilds index.html and notifies browsers via SSE
 * - Serves index.html with an injected live-reload script
 */

import { spawn } from 'node:child_process'
import { createServer, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import chokidar from 'chokidar'

const PORT = 3456
const ROOT = dirname(fileURLToPath(import.meta.url))

// ============================================================================
// Build management
// ============================================================================

let building = false
const sseClients = new Set<ServerResponse>()

async function rebuild(): Promise<void> {
  if (building) return
  building = true

  console.log('\x1b[36m[dev]\x1b[0m Rebuilding samples...')
  const t0 = performance.now()

  const exitCode = await new Promise<number | null>((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', join(ROOT, 'index.ts')], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    })

    child.on('exit', (code) => {
      resolve(code)
    })

    child.on('error', () => {
      resolve(1)
    })
  })

  const ms = (performance.now() - t0).toFixed(0)

  if (exitCode === 0) {
    console.log(`\x1b[32m[dev]\x1b[0m Rebuilt in ${ms}ms`)

    for (const client of sseClients) {
      try {
        client.write('data: reload\n\n')
      } catch {
        sseClients.delete(client)
      }
    }
  } else {
    console.error(`\x1b[31m[dev]\x1b[0m Build failed (exit ${exitCode ?? 'unknown'})`)
  }

  building = false
}

// ============================================================================
// File watching — debounced to coalesce rapid saves
// ============================================================================

let debounce: NodeJS.Timeout | null = null

function onFileChange(filename: string | null): void {
  if (filename === 'index.html') return

  if (debounce) clearTimeout(debounce)

  debounce = setTimeout(() => {
    console.log(`\x1b[90m[dev]\x1b[0m Change detected${filename ? `: ${filename}` : ''}`)
    void rebuild()
  }, 150)
}

const watcher = chokidar.watch(
  [join(ROOT, 'src'), join(ROOT, 'public'), join(ROOT, 'index.ts'), join(ROOT, 'samples-data.ts')],
  {
    ignoreInitial: true,
  },
)

watcher.on('all', (_event, path) => {
  const relPath = path ? relative(ROOT, path) : null
  onFileChange(relPath)
})

// ============================================================================
// HTTP server
// ============================================================================

await rebuild()

console.log(`\x1b[36m[dev]\x1b[0m Server running at \x1b[1mhttp://localhost:${PORT}\x1b[0m`)
console.log('\x1b[36m[dev]\x1b[0m Watching for changes in src/ and index.ts\\n')

const server = createServer((req, res) => {
  const requestUrl = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  if (requestUrl.pathname === '/__dev_events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write('\n')

    sseClients.add(res)

    req.on('close', () => {
      sseClients.delete(res)
    })

    return
  }

  const indexPath = join(ROOT, 'index.html')
  if (!existsSync(indexPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('index.html not found — build may have failed')
    return
  }

  let html = readFileSync(indexPath, 'utf8')

  html = html.replace(
    '</body>',
    `  <script>
    // Live reload — SSE connection to dev server.
    ;(function() {
      function connect() {
        var es = new EventSource('/__dev_events');
        es.onmessage = function(e) {
          if (e.data === 'reload') location.reload();
        };
        es.onerror = function() {
          es.close();
          setTimeout(connect, 500);
        };
      }
      connect();
    })();
  </script>
</body>`,
  )

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
})

server.listen(PORT)
