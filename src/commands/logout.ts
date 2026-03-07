import { readStore, clearStore } from '../lib/store.js'
import { banner, success, dim } from '../lib/ui.js'

export async function logoutCommand(): Promise<void> {
  banner()

  const config = readStore()

  if (!config.apiKey) {
    console.log(dim('  Not logged in — nothing to do.'))
    console.log()
    return
  }

  clearStore()
  console.log(success('  ✓ Logged out. Saved API key removed.'))
  console.log()
  console.log(dim('  To log in again, run: ') + 'npx @piut/cli')
  console.log()
}
