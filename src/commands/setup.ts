import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { password, confirm, checkbox } from '@inquirer/prompts'
import chalk from 'chalk'
import { validateKey } from '../lib/api.js'
import { TOOLS } from '../lib/tools.js'
import { resolveConfigPaths } from '../lib/paths.js'
import { mergeConfig, isPiutConfigured } from '../lib/config.js'
import { placeSkillFile } from '../lib/skill.js'
import { banner, brand, success, warning, dim, toolLine } from '../lib/ui.js'
import type { DetectedTool } from '../types.js'

interface SetupOptions {
  key?: string
  tool?: string
  project?: boolean
  skipSkill?: boolean
}

export async function setupCommand(options: SetupOptions): Promise<void> {
  banner()

  // 1. Get API key
  let apiKey = options.key
  if (!apiKey) {
    apiKey = await password({
      message: 'Enter your p\u0131ut API key:',
      mask: '*',
      validate: (v) => v.startsWith('pb_') || 'Key must start with pb_',
    })
  }

  // 2. Validate key
  console.log(dim('  Validating key...'))
  let validationResult
  try {
    validationResult = await validateKey(apiKey)
  } catch (err: unknown) {
    console.log(chalk.red(`  \u2717 ${(err as Error).message}`))
    console.log(dim('  Get a key at https://piut.com/dashboard/keys'))
    process.exit(1)
  }

  const { slug, displayName } = validationResult
  console.log(success(`  \u2714 Authenticated as ${displayName} (${slug})`))
  console.log()

  // 3. Detect installed tools
  const detected: DetectedTool[] = []
  const toolFilter = options.tool

  for (const tool of TOOLS) {
    if (toolFilter && tool.id !== toolFilter) continue

    const paths = resolveConfigPaths(tool.configPaths)

    // For tools with project-local and global paths, prefer project-local if it exists
    for (const configPath of paths) {
      const exists = fs.existsSync(configPath)
      const parentExists = fs.existsSync(path.dirname(configPath))

      if (exists || parentExists) {
        detected.push({
          tool,
          configPath,
          exists,
          alreadyConfigured: exists && isPiutConfigured(configPath, tool.configKey),
        })
        break
      }
    }
  }

  if (detected.length === 0) {
    console.log(warning('  No supported AI tools detected.'))
    console.log(dim('  Supported: Claude Code, Claude Desktop, Cursor, Windsurf, GitHub Copilot, Amazon Q, Zed'))
    console.log(dim('  See https://piut.com/docs for manual setup.'))
    console.log()
    return
  }

  // 4. Show detected tools, let user select
  const choices = detected.map(d => ({
    name: d.alreadyConfigured
      ? `${d.tool.name} ${dim('(already configured)')}`
      : d.tool.name,
    value: d,
    checked: !d.alreadyConfigured,
  }))

  const selected = await checkbox({
    message: 'Select tools to configure:',
    choices,
  })

  if (selected.length === 0) {
    console.log(dim('  No tools selected.'))
    return
  }

  // 5. Configure each selected tool
  console.log()
  const configured: string[] = []
  const skipped: string[] = []

  for (const det of selected) {
    const { tool, configPath, alreadyConfigured } = det

    if (alreadyConfigured) {
      const update = await confirm({
        message: `p\u0131ut is already configured in ${tool.name}. Update it?`,
        default: true,
      })
      if (!update) {
        skipped.push(tool.name)
        continue
      }
    }

    // Claude Code: try quick command first
    if (tool.id === 'claude-code' && tool.quickCommand && isCommandAvailable('claude')) {
      try {
        execSync(tool.quickCommand(slug, apiKey), { stdio: 'pipe' })
        configured.push(tool.name)
        toolLine(tool.name, success('configured via CLI'), '\u2714')
        continue
      } catch {
        console.log(dim('  Claude CLI command failed, using config file...'))
      }
    }

    // Standard config file merge
    const serverConfig = tool.generateConfig(slug, apiKey)
    mergeConfig(configPath, tool.configKey, serverConfig)
    configured.push(tool.name)
    toolLine(tool.name, success('configured'), '\u2714')
  }

  // 6. Skill file placement
  if (!options.skipSkill && configured.length > 0) {
    console.log()
    const addSkill = await confirm({
      message: 'Add skill.md reference to rules files? (teaches AI how to use p\u0131ut)',
      default: true,
    })

    if (addSkill) {
      for (const det of selected) {
        if (!det.tool.skillFilePath) continue
        if (!configured.includes(det.tool.name)) continue

        const result = placeSkillFile(det.tool.skillFilePath)
        if (result.created) {
          console.log(dim(`  Created ${det.tool.skillFilePath}`))
        } else if (result.appended) {
          console.log(dim(`  Updated ${det.tool.skillFilePath}`))
        } else {
          console.log(dim(`  ${det.tool.skillFilePath} already has skill reference`))
        }
      }
    }
  }

  // 7. Summary
  console.log()
  console.log(brand.bold('  Setup complete!'))
  if (configured.length > 0) {
    console.log(success(`  Configured: ${configured.join(', ')}`))
  }
  if (skipped.length > 0) {
    console.log(dim(`  Skipped: ${skipped.join(', ')}`))
  }
  console.log()
  console.log(dim('  Restart your AI tools for changes to take effect.'))
  console.log(dim('  Verify: ask any AI "What do you know about me from my context?"'))
  console.log()
}

function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}
