import fs from 'fs'
import { TOOLS } from '../lib/tools.js'
import { resolveConfigPaths } from '../lib/paths.js'
import { isPiutConfigured } from '../lib/config.js'
import { banner, success, dim, warning, toolLine } from '../lib/ui.js'

export function statusCommand(): void {
  banner()
  console.log('  AI tool configuration status:')
  console.log()

  let foundAny = false

  for (const tool of TOOLS) {
    const paths = resolveConfigPaths(tool.configPaths)

    for (const configPath of paths) {
      if (!fs.existsSync(configPath)) continue

      foundAny = true
      const configured = isPiutConfigured(configPath, tool.configKey)

      if (configured) {
        toolLine(tool.name, success('connected'), '\u2714')
      } else {
        toolLine(tool.name, dim('installed, not connected'), '\u25cb')
      }
      break
    }
  }

  if (!foundAny) {
    console.log(warning('  No supported AI tools detected.'))
    console.log(dim('  Supported: Claude Code, Claude Desktop, Cursor, Windsurf, GitHub Copilot, Amazon Q, Zed'))
  }

  console.log()
}
