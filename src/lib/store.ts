import fs from 'fs'
import path from 'path'
import os from 'os'

export interface PiutConfig {
  apiKey?: string
  globalInstallOffered?: boolean
}

const CONFIG_DIR = path.join(os.homedir(), '.piut')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

/** Read the config file, or return defaults */
export function readStore(): PiutConfig {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

/** Update specific fields in the config */
export function updateStore(updates: Partial<PiutConfig>): PiutConfig {
  const config = readStore()
  const updated = { ...config, ...updates }
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2) + '\n', 'utf-8')
  return updated
}

/** Remove the saved API key */
export function clearStore(): void {
  try {
    fs.unlinkSync(CONFIG_FILE)
  } catch {
    // Already gone — nothing to do
  }
}
