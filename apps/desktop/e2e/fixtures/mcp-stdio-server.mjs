#!/usr/bin/env node

const toolSet = process.argv.includes('--alt')
  ? ['alt_echo', 'alt_ping']
  : ['echo', 'ping']

let buffer = Buffer.alloc(0)

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])

  while (buffer.length > 0) {
    const separatorIndex = buffer.indexOf('\r\n\r\n')
    if (separatorIndex === -1) {
      return
    }

    const headers = buffer.slice(0, separatorIndex).toString('utf8')
    const lengthMatch = headers.match(/Content-Length:\s*(\d+)/i)
    if (!lengthMatch) {
      buffer = Buffer.alloc(0)
      return
    }

    const bodyLength = Number(lengthMatch[1])
    const frameLength = separatorIndex + 4 + bodyLength
    if (buffer.length < frameLength) {
      return
    }

    const body = buffer.slice(separatorIndex + 4, frameLength).toString('utf8')
    buffer = buffer.slice(frameLength)

    const message = JSON.parse(body)

    if (message.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: {
            name: 'desktop-e2e-fixture',
            version: '1.0.0',
          },
        },
      })
      continue
    }

    if (message.method === 'tools/list') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: toolSet.map((name) => ({ name })),
        },
      })
      continue
    }

    if (message.id !== undefined) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32601,
          message: 'Method not found',
        },
      })
    }
  }
})

function send(payload) {
  const body = JSON.stringify(payload)
  const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`
  process.stdout.write(frame)
}
