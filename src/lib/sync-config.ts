import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

export interface SyncConfig {
  apiKey?: string
  deviceId: string
  deviceName: string
  autoDiscover: boolean
  keepBrainUpdated: boolean
  useBrain: boolean
  backedUpFiles: string[]
}

const CONFIG_DIR = path.join(os.homedir(), '.piut')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

function defaultDeviceName(): string {
  return os.hostname() || 'unknown'
}

function generateDeviceId(): string {
  return `dev_${crypto.randomBytes(8).toString('hex')}`
}

/** Read the sync config file, or return defaults */
export function readSyncConfig(): SyncConfig {
  const defaults: SyncConfig = {
    deviceId: generateDeviceId(),
    deviceName: defaultDeviceName(),
    autoDiscover: false,
    keepBrainUpdated: false,
    useBrain: false,
    backedUpFiles: [],
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return { ...defaults, ...parsed }
  } catch {
    return defaults
  }
}

/** Write the sync config file */
export function writeSyncConfig(config: SyncConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

/** Update specific fields in the config */
export function updateSyncConfig(updates: Partial<SyncConfig>): SyncConfig {
  const config = readSyncConfig()
  const updated = { ...config, ...updates }
  writeSyncConfig(updated)
  return updated
}

/** Check if sync is configured (has API key) */
export function isSyncConfigured(): boolean {
  const config = readSyncConfig()
  return !!config.apiKey
}

/** Get the config directory path */
export function getConfigDir(): string {
  return CONFIG_DIR
}

/** Get the config file path */
export function getConfigFile(): string {
  return CONFIG_FILE
}
