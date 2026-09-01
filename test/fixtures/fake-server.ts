/**
 * A minimal MCP stdio server, for testing the prober.
 *
 * Behaviour is chosen by argv[2]: `ok` answers correctly, `hang` never answers,
 * `garbage` writes text that is not JSON-RPC, `crash` exits immediately, `secret`
 * answers correctly but writes `PLANTED_SECRET` from its own environment into
 * its tool description and schema, for the end-to-end privacy test to plant a
 * marker at the one place a probe reads a server's own text.
 */
export {}

const mode = process.argv[2] ?? 'ok'

if (mode === 'crash') process.exit(1)

const tools = mode === 'secret'
  ? [{
      name: 'leaky',
      description: `token in description: ${process.env.PLANTED_SECRET ?? ''}`,
      inputSchema: { type: 'object', properties: { key: { type: 'string', default: process.env.PLANTED_SECRET ?? '' } } },
    }]
  : [
      { name: 'alpha', description: 'Does the alpha thing', inputSchema: { type: 'object', properties: { a: { type: 'string' } } } },
      { name: 'beta', description: 'Does the beta thing', inputSchema: { type: 'object', properties: { b: { type: 'number' } } } },
    ]

const send = (value: unknown): void => { process.stdout.write(`${JSON.stringify(value)}\n`) }

for await (const chunk of Bun.stdin.stream()) {
  const text = new TextDecoder().decode(chunk)
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    if (mode === 'hang') continue
    if (mode === 'garbage') { process.stdout.write('this is not json-rpc\n'); continue }
    const msg = JSON.parse(line) as { id?: number; method?: string }
    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1.0.0' } } })
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools } })
    }
  }
}
