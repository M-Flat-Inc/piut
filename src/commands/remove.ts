import fs from 'fs'
import { checkbox, confirm } from '@inquirer/prompts'
import { TOOLS } from '../lib/tools.js'
import { resolveConfigPaths } from '../lib/paths.js'
import { isPiutConfigured, removeFromConfig } from '../lib/config.js'
import { banner, success, dim, warning, toolLine } from '../lib/ui.js'
import { readStore } from '../lib/store.js'
import { deleteConnections } from '../lib/api.js'

export async function removeCommand(): Promise<void> {
  banner()

  const configured: { tool: (typeof TOOLS)[0]; configPath: string }[] = []

  for (const tool of TOOLS) {
    if (!tool.configKey) continue // Skip skill-only tools
    const paths = resolveConfigPaths(tool.configPaths)
    for (const configPath of paths) {
      if (fs.existsSync(configPath) && isPiutConfigured(configPath, tool.configKey)) {
        configured.push({ tool, configPath })
        break
      }
    }
  }

  if (configured.length === 0) {
    console.log(dim('  p\u0131ut is not configured in any detected AI tools.'))
    console.log()
    return
  }

  const choices = configured.map(c => ({
    name: c.tool.name,
    value: c,
  }))

  const selected = await checkbox({
    message: 'Select tools to remove p\u0131ut from:',
    choices,
  })

  if (selected.length === 0) {
    console.log(dim('  No tools selected.'))
    return
  }

  const proceed = await confirm({
    message: `Remove p\u0131ut from ${selected.length} tool(s)?`,
    default: false,
  })

  if (!proceed) return

  console.log()
  const removedNames: string[] = []
  for (const { tool, configPath } of selected) {
    if (!tool.configKey) continue
    const removed = removeFromConfig(configPath, tool.configKey)
    if (removed) {
      removedNames.push(tool.name)
      toolLine(tool.name, success('removed'), '\u2714')
    } else {
      toolLine(tool.name, warning('not found'), '\u00d7')
    }
  }

  // Clear server-side connection records (best-effort)
  const store = readStore()
  if (store.apiKey && removedNames.length > 0) {
    deleteConnections(store.apiKey, removedNames).catch(() => {})
  }

  console.log()
  console.log(dim('  Restart your AI tools for changes to take effect.'))
  console.log()
}
