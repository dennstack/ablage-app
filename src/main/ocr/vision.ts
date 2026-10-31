const PROMPT =
  'Transkribiere den gesamten Text dieses Dokumentenscans wortgetreu und in Lesereihenfolge. ' +
  'Behalte Zeilenumbrüche bei. Gib ausschließlich den erkannten Text zurück, ohne Kommentare oder Formatierung.'

export async function visionOcr(url: string, model: string, png: Uint8Array, signal?: AbortSignal): Promise<string> {
  const res = await ollamaFetch(url, '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: 0 },
      messages: [{ role: 'user', content: PROMPT, images: [Buffer.from(png).toString('base64')] }]
    }),
    signal: signal ?? AbortSignal.timeout(300_000)
  })
  if (!res.ok) throw new Error(`Ollama Vision antwortete mit Status ${res.status}: ${await res.text()}`)
  const body = (await res.json()) as { message?: { content?: string } }
  return body.message?.content?.trim() ?? ''
}

/** fetch() against Ollama with a readable error when the server is unreachable. */
export async function ollamaFetch(base: string, path: string, init?: RequestInit): Promise<Response> {
  const url = `${base.replace(/\/$/, '')}${path}`
  try {
    return await fetch(url, init)
  } catch (err) {
    const cause = (err as { cause?: { message?: string; code?: string } }).cause
    if ((err as Error).name === 'TimeoutError') throw new Error(`Zeitüberschreitung bei Ollama (${base})`)
    throw new Error(`Ollama nicht erreichbar (${base}): ${cause?.code ?? cause?.message ?? (err as Error).message}`)
  }
}
