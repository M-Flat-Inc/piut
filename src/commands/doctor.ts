import fs from 'fs'
import chalk from 'chalk'
import { readStore } from '../lib/store.js'
import { validateKey, verifyMcpEndpoint } from '../lib/api.js'
import { TOOLS } from '../lib/tools.js'
import { resolveConfigPaths } from '../lib/paths.js'
import { getPiutConfig, extractKeyFromConfig, mergeConfig } from '../lib/config.js'
import { banner, success, warning, dim, error, toolLine } from '../lib/ui.js'
import { CliError } from '../types.js'

interface DoctorOptions {
  key?: string
  fix?: boolean
  json?: boolean
}

interface DoctorResult {
  key: { valid: boolean; slug?: string; displayName?: string; prefix?: string; error?: string }
  tools: Array<{
    name: string
    id: string
    configPath: string
    found: boolean
    configured: boolean
    keyMatch: 'match' | 'stale' | 'missing'
    keyPrefix?: string
    fixed?: boolean
  }>
  mcp: { ok: boolean; tools: string[]; latencyMs: number; error?: string }
  issues: number
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  if (!options.json) banner()

  const result: DoctorResult = {
    key: { valid: false },
    tools: [],
    mcp: { ok: false, tools: [], latencyMs: 0 },
    issues: 0,
  }

  // 1. Check saved API key
  const store = readStore()
  const apiKey = options.key || store.apiKey

  if (!apiKey) {
    result.key = { valid: false, error: 'No API key found' }
    result.issues++
    if (!options.json) {
      console.log('  API Key')
      console.log(error(`  ✗ No API key saved. Run: piut setup --key pb_YOUR_KEY`))
      console.log()
    }
  } else {
    const prefix = apiKey.slice(0, 7) + '...'
    try {
      const validation = await validateKey(apiKey)
      result.key = {
        valid: true,
        slug: validation.slug,
        displayName: validation.displayName,
        prefix,
      }
      if (!options.json) {
        console.log('  API Key')
        console.log(success(`  ✔ Key valid: ${validation.displayName} (${validation.slug})`) + dim(`    ${prefix}`))
        console.log()
      }
    } catch (err: unknown) {
      result.key = { valid: false, prefix, error: (err as Error).message }
      result.issues++
      if (!options.json) {
        console.log('  API Key')
        console.log(error(`  ✗ Key invalid: ${(err as Error).message}`) + dim(`    ${prefix}`))
        console.log()
      }
    }
  }

  // 2. Check tool configurations
  if (!options.json) {
    console.log('  Tool Configurations')
  }

  let toolsFixed = 0

  for (const tool of TOOLS) {
    const paths = resolveConfigPaths(tool.configPaths)

    for (const configPath of paths) {
      if (!fs.existsSync(configPath)) continue

      const piutConfig = getPiutConfig(configPath, tool.configKey)

      if (!piutConfig) {
        result.tools.push({
          name: tool.name,
          id: tool.id,
          configPath,
          found: true,
          configured: false,
          keyMatch: 'missing',
        })
        if (!options.json) {
          toolLine(tool.name, dim('installed, not configured'), '○')
        }
        break
      }

      const configKey = extractKeyFromConfig(piutConfig)
      const configPrefix = configKey ? configKey.slice(0, 7) + '...' : '(none)'
      let keyMatch: 'match' | 'stale' | 'missing' = 'missing'

      if (!configKey) {
        keyMatch = 'missing'
        result.issues++
      } else if (apiKey && configKey === apiKey) {
        keyMatch = 'match'
      } else {
        keyMatch = 'stale'
        result.issues++
      }

      const toolResult = {
        name: tool.name,
        id: tool.id,
        configPath,
        found: true,
        configured: true,
        keyMatch,
        keyPrefix: configPrefix,
        fixed: false,
      }

      // Fix stale configs if --fix
      if (keyMatch === 'stale' && options.fix && apiKey && result.key.valid && result.key.slug) {
        const serverConfig = tool.generateConfig(result.key.slug, apiKey)
        mergeConfig(configPath, tool.configKey, serverConfig)
        toolResult.fixed = true
        toolResult.keyMatch = 'match'
        result.issues-- // no longer an issue
        toolsFixed++
      }

      result.tools.push(toolResult)

      if (!options.json) {
        if (toolResult.fixed) {
          toolLine(tool.name, success('fixed') + dim(` → ${configPath}`), '✔')
        } else if (keyMatch === 'match') {
          toolLine(tool.name, success('key matches') + dim(` ${configPath}`), '✔')
        } else if (keyMatch === 'stale') {
          toolLine(tool.name, warning(`key STALE (${configPrefix})`) + dim(` ${configPath}`), '✗')
        } else {
          toolLine(tool.name, warning('no key found') + dim(` ${configPath}`), '✗')
        }
      }

      break // only check first matching path per tool
    }
  }

  if (result.tools.length === 0 && !options.json) {
    console.log(dim('  No AI tools detected.'))
  }

  if (!options.json) console.log()

  // 3. Check MCP endpoint
  if (apiKey && result.key.valid && result.key.slug) {
    const serverUrl = `https://piut.com/api/mcp/${result.key.slug}`
    const mcpResult = await verifyMcpEndpoint(serverUrl, apiKey)
    result.mcp = mcpResult

    if (!mcpResult.ok) {
      result.issues++
    }

    if (!options.json) {
      console.log('  MCP Server')
      if (mcpResult.ok) {
        console.log(success(`  ✔ ${serverUrl}`) + dim(`    ${mcpResult.tools.length} tools, ${mcpResult.latencyMs}ms`))
        if (mcpResult.tools.length > 0) {
          console.log(dim(`    ${mcpResult.tools.join(', ')}`))
        }
      } else {
        console.log(error(`  ✗ ${serverUrl}`) + dim(`    ${mcpResult.error}`))
      }
      console.log()
    }
  } else if (!options.json) {
    console.log('  MCP Server')
    console.log(dim('  ⊘ Skipped (no valid key)'))
    console.log()
  }

  // 4. Summary
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    if (result.issues > 0) throw new CliError(`${result.issues} issue(s) found`)
    return
  }

  if (toolsFixed > 0) {
    console.log(success(`  Fixed ${toolsFixed} stale config(s).`))
    console.log()
  }

  if (result.issues === 0) {
    console.log(success('  All checks passed.'))
  } else {
    console.log(warning(`  ${result.issues} issue(s) found.`))

    // Suggest fixes
    const staleTools = result.tools.filter(t => t.keyMatch === 'stale' && !t.fixed)
    if (staleTools.length > 0 && !options.fix) {
      console.log()
      console.log(dim('  Fix stale configs: ') + chalk.cyan('piut doctor --fix'))
    }

    if (!result.key.valid) {
      console.log(dim('  Set a valid key: ') + chalk.cyan('piut setup --key pb_YOUR_KEY'))
    }
  }

  console.log()

  if (result.issues > 0) throw new CliError(`${result.issues} issue(s) found`)
}
