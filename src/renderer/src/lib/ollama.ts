/** Renders a tiny "scan" for the vision model test; must contain the token checked in main (4711). */
export async function renderSamplePng(): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = 480
  canvas.height = 160
  const g = canvas.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.fillStyle = '#000'
  g.font = 'bold 40px Arial, sans-serif'
  g.fillText('Rechnung 4711', 24, 70)
  g.font = '24px Arial, sans-serif'
  g.fillText('Betrag: 89,90 EUR', 24, 120)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG konnte nicht erzeugt werden'))), 'image/png')
  )
  return new Uint8Array(await blob.arrayBuffer())
}

export function installCommand(platform: string): string | null {
  if (platform === 'win32') return 'winget install Ollama.Ollama'
  if (platform === 'darwin') return 'brew install ollama'
  if (platform === 'linux') return 'curl -fsSL https://ollama.com/install.sh | sh'
  return null
}
