import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { confirm } from '@inquirer/prompts'
import type { DetectedTool, ValidateResponse } from '../types.js'
import { TOOLS } from './tools.js'
import { resolveConfigPaths } from './paths.js'
import { isPiutConfigured, mergeConfig } from './config.js'
import { placeSkillFile } from './skill.js'
import { success, dim, warning } from './ui.js'
import { pingMcp } from './api.js'

/** Detect all installed AI tools and their connection status. */
export function detectTools(): DetectedTool[] {
  const detected: DetectedTool[] = []

  for (const tool of TOOLS) {
    const paths = resolveConfigPaths(tool)

    for (const { filePath, configKey } of paths) {
      const exists = fs.existsSync(filePath)
      const parentExists = fs.existsSync(path.dirname(filePath))

      if (exists || parentExists) {
        detected.push({
          tool,
          configPath: filePath,
          resolvedConfigKey: configKey,
          exists,
          alreadyConfigured: exists && !!configKey && isPiutConfigured(filePath, configKey),
        })
        break
      }
    }
  }

  return detected
}

/** Connect all detected tools with a single Y/n prompt. */
export async function connectAll(
  slug: string,
  apiKey: string,
  validation: ValidateResponse,
  opts?: { nonInteractive?: boolean }
): Promise<{ connected: number; skipped: number }> {
  const detected = detectTools()
  const mcpTools = detected.filter(d => !d.tool.skillOnly)
  const unconfigured = mcpTools.filter(d => !d.alreadyConfigured)

  if (mcpTools.length === 0) {
    console.log(warning('  No supported AI tools detected.'))
    console.log(dim('  Supported: Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Amazon Q, Zed'))
    console.log()
    return { connected: 0, skipped: 0 }
  }

  // Show summary
  console.log()
  const toolNames = mcpTools.map(d => d.tool.name).join(', ')
  console.log(`  Found ${mcpTools.length} tool${mcpTools.length === 1 ? '' : 's'}: ${toolNames}`)

  if (unconfigured.length === 0) {
    console.log(dim('  All tools are already connected.'))
    console.log()
    return { connected: 0, skipped: mcpTools.length }
  }

  const alreadyCount = mcpTools.length - unconfigured.length
  if (alreadyCount > 0) {
    console.log(dim(`  (${alreadyCount} already connected)`))
  }
  console.log()

  // Single Y/n prompt
  let proceed = true
  if (!opts?.nonInteractive) {
    proceed = await confirm({
      message: `Connect ${unconfigured.length === mcpTools.length ? 'all' : unconfigured.length} tool${unconfigured.length === 1 ? '' : 's'}?`,
      default: true,
    })
  }

  if (!proceed) {
    console.log(dim('  Skipped. You can connect tools later from the main menu.'))
    console.log()
    return { connected: 0, skipped: unconfigured.length }
  }

  // Configure all unconfigured tools
  console.log()
  console.log(dim('  Connecting...'))
  console.log()

  let connected = 0

  for (const det of unconfigured) {
    const { tool, configPath, resolvedConfigKey } = det

    // Claude Code: try quick command first
    if (tool.id === 'claude-code' && tool.quickCommand && isCommandAvailable('claude')) {
      try {
        const [cmd, ...args] = tool.quickCommand(slug, apiKey);
        execFileSync(cmd, args, { stdio: 'pipe' })
        connected++
        console.log(`    ${tool.name.padEnd(20)} ${success('done')}`)
        continue
      } catch {
        // Fall through to config file approach
      }
    }

    // Standard config file merge
    if (tool.generateConfig && resolvedConfigKey) {
      const serverConfig = tool.generateConfig(slug, apiKey)
      mergeConfig(configPath, resolvedConfigKey, serverConfig)
      connected++

      // Place skill file silently
      if (tool.skillFilePath) {
        placeSkillFile(tool.skillFilePath)
      }

      console.log(`    ${tool.name.padEnd(20)} ${success('done')}`)
    }
  }

  console.log()

  if (connected > 0) {
    console.log(success(`  ${connected} tool${connected === 1 ? '' : 's'} connected!`) +
      dim(' They\u2019ll access your brain'))
    console.log(dim('  next time you start a conversation.'))
    console.log()
    console.log(dim('  Note: You may need to restart your AI tools for changes to take effect.'))

    // Register connections (fire-and-forget)
    if (validation.serverUrl) {
      Promise.all(
        unconfigured.slice(0, connected).map(({ tool }) =>
          pingMcp(validation.serverUrl, apiKey, tool.name)
        )
      ).catch(() => {})
    }
  }

  console.log()
  return { connected, skipped: alreadyCount }
}

function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}
