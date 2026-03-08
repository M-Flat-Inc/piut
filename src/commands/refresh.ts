import fs from 'fs'
import { resolveApiKeyWithResult } from '../lib/auth.js'
import { publishServer } from '../lib/api.js'
import { cycleMcpConfigs, cycleProjectConfigs, getConfiguredToolNames } from '../lib/sync.js'
import { banner, brand, success, dim, warning } from '../lib/ui.js'

interface RefreshOptions {
  key?: string
}

export async function refreshCommand(options: RefreshOptions): Promise<void> {
  banner()

  const { apiKey, slug, serverUrl, status } = await resolveApiKeyWithResult(options.key)

  const configuredTools = getConfiguredToolNames()
  const isDeployed = status === 'active'

  if (configuredTools.length === 0 && !isDeployed) {
    console.log()
    console.log(warning('  Nothing to refresh.'))
    console.log(dim('  Run ') + brand('piut setup') + dim(' first to configure your AI tools.'))
    console.log()
    return
  }

  console.log(dim('  Refreshing...'))

  // 1. Republish server if deployed
  if (isDeployed) {
    try {
      await publishServer(apiKey)
      console.log(success('  ✓ Server republished'))
    } catch {
      console.log(warning('  ✗ Could not republish server'))
    }
  }

  // 2. Cycle all tool MCP configs
  if (configuredTools.length > 0) {
    await cycleMcpConfigs(slug, apiKey)
    console.log(success('  ✓ Refreshed MCP connections'))
    console.log(dim(`    Cycled: ${configuredTools.join(', ')}`))
  }

  // 3. Cycle all connected projects
  const refreshedProjects = await cycleProjectConfigs(slug, apiKey, serverUrl)
  if (refreshedProjects.length > 0) {
    console.log(success('  ✓ Refreshed connected projects'))
    console.log(dim(`    Updated: ${refreshedProjects.join(', ')}`))
  }

  console.log()
  console.log(dim('  Tools that watch config files will reconnect automatically.'))
  console.log(dim('  If a tool doesn\'t refresh, restart it manually.'))
  console.log()
}
