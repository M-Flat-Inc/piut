import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { password, confirm, checkbox } from '@inquirer/prompts'
import chalk from 'chalk'
import { validateKey, pingMcp, verifyMcpEndpoint } from '../lib/api.js'
import { TOOLS } from '../lib/tools.js'
import { resolveConfigPaths, expandPath } from '../lib/paths.js'
import { mergeConfig, isPiutConfigured, getPiutConfig, extractKeyFromConfig, extractSlugFromConfig } from '../lib/config.js'
import { placeSkillFile } from '../lib/skill.js'
import { writePiutConfig, writePiutSkill, ensureGitignored } from '../lib/piut-dir.js'
import { offerGlobalInstall } from '../lib/global-install.js'
import { banner, brand, success, warning, dim, toolLine } from '../lib/ui.js'
import { CliError } from '../types.js'
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
      throw new CliError('--key is required when using --yes')
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
    throw new CliError((err as Error).message)
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

  // 3. Detect installed tools (with stale key detection)
  const detected: DetectedTool[] = []
  const toolFilter = options.tool

  for (const tool of TOOLS) {
    if (toolFilter && tool.id !== toolFilter) continue
    // Skip skill-only tools in setup — they don't have MCP config files
    if (tool.skillOnly) continue

    const paths = resolveConfigPaths(tool)

    // For tools with project-local and global paths, prefer project-local if it exists
    for (const { filePath, configKey } of paths) {
      const exists = fs.existsSync(filePath)
      const parentExists = fs.existsSync(path.dirname(filePath))

      if (exists || parentExists) {
        const configured = exists && !!configKey && isPiutConfigured(filePath, configKey)

        // Check if existing config has a different (stale) key or wrong slug
        let staleKey = false
        if (configured && configKey) {
          const piutConfig = getPiutConfig(filePath, configKey)
          if (piutConfig) {
            const existingKey = extractKeyFromConfig(piutConfig)
            if (existingKey && existingKey !== apiKey) {
              staleKey = true
            }
            const existingSlug = extractSlugFromConfig(piutConfig)
            if (existingSlug && existingSlug !== slug) {
              staleKey = true
            }
          }
        }

        detected.push({
          tool,
          configPath: filePath,
          resolvedConfigKey: configKey,
          exists,
          alreadyConfigured: configured && !staleKey,
          staleKey,
        })
        break
      }
    }
  }

  if (detected.length === 0) {
    console.log(warning('  No supported AI tools detected.'))
    console.log(dim('  See https://piut.com/docs for manual setup.'))
    console.log()
    return
  }

  // 4. Select tools to configure (stale configs auto-selected)
  let selected: DetectedTool[]

  if (options.yes) {
    // Auto-select unconfigured + stale tools
    selected = detected.filter(d => !d.alreadyConfigured || d.staleKey)
    if (selected.length === 0) {
      console.log(dim('  All detected tools are already configured.'))
      console.log()
      return
    }
  } else {
    const choices = detected.map(d => ({
      name: d.staleKey
        ? `${d.tool.name} ${warning('(stale key — will update)')}`
        : d.alreadyConfigured
          ? `${d.tool.name} ${dim('(already configured)')}`
          : d.tool.name,
      value: d,
      checked: !d.alreadyConfigured || d.staleKey,
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

    if (alreadyConfigured && !det.staleKey) {
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
      let quickSuccess = false
      try {
        execSync(tool.quickCommand(slug, apiKey), { stdio: 'pipe' })
        // Verify the config was actually written
        const claudeJson = expandPath('~/.claude.json')
        const written = tool.configKey ? getPiutConfig(claudeJson, tool.configKey) : null
        if (written) {
          quickSuccess = true
          configured.push(tool.name)
          toolLine(tool.name, success('configured via CLI'), '✔')
          continue
        }
        // Quick command claimed success but config not found — try with explicit scope
        try {
          execSync(tool.quickCommand(slug, apiKey) + ' --scope user', { stdio: 'pipe' })
          const retryCheck = tool.configKey ? getPiutConfig(claudeJson, tool.configKey) : null
          if (retryCheck) {
            quickSuccess = true
            configured.push(tool.name)
            toolLine(tool.name, success('configured via CLI'), '✔')
            continue
          }
        } catch { /* fall through to config file merge */ }
        console.log(dim('  Quick command succeeded but config not found, using config file...'))
      } catch (err: unknown) {
        const stderr = (err as { stderr?: Buffer })?.stderr?.toString().trim()
        if (stderr) {
          console.log(dim(`  Claude CLI: ${stderr}`))
        }
        console.log(dim('  Claude CLI command failed, using config file...'))
      }
      if (quickSuccess) continue
    }

    // Standard config file merge
    if (tool.generateConfig && det.resolvedConfigKey) {
      const serverConfig = tool.generateConfig(slug, apiKey)
      mergeConfig(configPath, det.resolvedConfigKey, serverConfig)
      configured.push(tool.name)
      toolLine(tool.name, success('configured'), '✔')
    }
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

  // 7. Create .piut/ in current project if applicable
  if (configured.length > 0) {
    const cwd = process.cwd()
    const isProject = fs.existsSync(path.join(cwd, '.git')) || fs.existsSync(path.join(cwd, 'package.json'))
    if (isProject) {
      const { serverUrl } = validationResult
      writePiutConfig(cwd, { slug, apiKey, serverUrl })
      await writePiutSkill(cwd, slug, apiKey)
      ensureGitignored(cwd)
      console.log()
      console.log(dim('  Created .piut/ in current project'))
    }
  }

  // 8. Verify configurations and MCP endpoint
  if (configured.length > 0) {
    const { serverUrl } = validationResult
    console.log()
    console.log(dim('  Verifying...'))

    // Verify each tool's config was written correctly
    for (const det of selected) {
      if (!configured.includes(det.tool.name)) continue
      if (!det.resolvedConfigKey) continue
      const piutConfig = getPiutConfig(det.configPath, det.resolvedConfigKey)
      if (piutConfig) {
        toolLine(det.tool.name, success('config verified'), '✔')
      } else {
        toolLine(det.tool.name, warning('config not found — run piut doctor'), '✗')
      }
    }

    // Verify MCP endpoint + register connections
    const mcpResult = await verifyMcpEndpoint(serverUrl, apiKey)
    if (mcpResult.ok) {
      toolLine('MCP server', success(`${mcpResult.tools.length} tools available`) + dim(` (${mcpResult.latencyMs}ms)`), '✔')
    } else {
      toolLine('MCP server', warning(mcpResult.error || 'unreachable') + dim(' — run piut doctor'), '✗')
    }

    // Also register connections in background
    await Promise.all(
      configured.map(toolName => pingMcp(serverUrl, apiKey, toolName))
    )
  }

  // 9. Summary
  console.log()
  console.log(brand.bold('  Setup complete!'))
  if (configured.length > 0) {
    console.log(success(`  Configured: ${configured.join(', ')}`))
  }
  if (skipped.length > 0) {
    console.log(dim(`  Skipped: ${skipped.join(', ')}`))
  }

  // 10. Install global `piut` command if not already available
  await offerGlobalInstall()

  console.log()
  console.log(dim('  Restart your AI tools for changes to take effect.'))
  console.log(dim('  Verify: ask any AI "What do you know about me from my context?"'))
  console.log(dim('  Diagnose issues: ') + chalk.cyan('piut doctor'))
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
