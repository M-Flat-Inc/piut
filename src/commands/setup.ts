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
  yes?: boolean
  project?: boolean
  skipSkill?: boolean
}

export async function setupCommand(options: SetupOptions): Promise<void> {
  banner()

  // 1. Get API key
  let apiKey = options.key
  if (!apiKey) {
    if (options.yes) {
      console.log(chalk.red('  ✗ --key is required when using --yes'))
      process.exit(1)
    }
    apiKey = await password({
      message: 'Enter your pıut API key:',
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
    console.log(chalk.red(`  ✗ ${(err as Error).message}`))
    console.log(dim('  Get a key at https://piut.com/dashboard/keys'))
    process.exit(1)
  }

  const { slug, displayName, status } = validationResult
  console.log(success(`  ✔ Authenticated as ${displayName}${slug ? ` (${slug})` : ''}`))
  console.log()

  // 2b. Check brain status — setup requires a published brain
  if (status === 'no_brain') {
    console.log(warning('  You haven\u2019t built a brain yet.'))
    console.log(dim('  Run ') + brand('piut build') + dim(' first, then ') + brand('piut deploy') + dim(' to publish it.'))
    console.log()
    return
  }

  if (status === 'unpublished') {
    console.log(warning('  Your brain is built but not deployed yet.'))
    console.log(dim('  Run ') + brand('piut deploy') + dim(' to publish your MCP server, then re-run setup.'))
    console.log()
    return
  }

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

  // 4. Select tools to configure
  let selected: DetectedTool[]

  if (options.yes) {
    // Auto-select all unconfigured tools
    selected = detected.filter(d => !d.alreadyConfigured)
    if (selected.length === 0) {
      console.log(dim('  All detected tools are already configured.'))
      console.log()
      return
    }
  } else {
    const choices = detected.map(d => ({
      name: d.alreadyConfigured
        ? `${d.tool.name} ${dim('(already configured)')}`
        : d.tool.name,
      value: d,
      checked: !d.alreadyConfigured,
    }))

    selected = await checkbox({
      message: 'Select tools to configure:',
      choices,
    })

    if (selected.length === 0) {
      console.log(dim('  No tools selected.'))
      return
    }
  }

  // 5. Configure each selected tool
  console.log()
  const configured: string[] = []
  const skipped: string[] = []

  for (const det of selected) {
    const { tool, configPath, alreadyConfigured } = det

    if (alreadyConfigured) {
      if (options.yes) {
        skipped.push(tool.name)
        continue
      }
      const update = await confirm({
        message: `pıut is already configured in ${tool.name}. Update it?`,
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
        toolLine(tool.name, success('configured via CLI'), '✔')
        continue
      } catch {
        console.log(dim('  Claude CLI command failed, using config file...'))
      }
    }

    // Standard config file merge
    const serverConfig = tool.generateConfig(slug, apiKey)
    mergeConfig(configPath, tool.configKey, serverConfig)
    configured.push(tool.name)
    toolLine(tool.name, success('configured'), '✔')
  }

  // 6. Skill file placement
  if (!options.skipSkill && configured.length > 0) {
    const addSkill = options.yes ? true : await confirm({
      message: 'Add skill.md reference to rules files? (teaches AI how to use pıut)',
      default: true,
    })

    if (addSkill) {
      console.log()
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
