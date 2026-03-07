import { Command } from 'commander'
import { setupCommand } from './commands/setup.js'
import { statusCommand } from './commands/status.js'
import { removeCommand } from './commands/remove.js'
import { buildCommand } from './commands/build.js'
import { deployCommand } from './commands/deploy.js'
import { connectCommand } from './commands/connect.js'
import { disconnectCommand } from './commands/disconnect.js'
import { logoutCommand } from './commands/logout.js'
import { interactiveMenu } from './commands/interactive.js'
import { checkForUpdate } from './lib/update-check.js'
import { CliError } from './types.js'

const VERSION = '3.2.0'

/**
 * Wrap a command action so that CliError (thrown instead of process.exit(1)
 * by sub-commands) causes a non-zero exit in standalone mode.
 */
function withExit<T extends (...args: unknown[]) => Promise<void>>(fn: T) {
  return async (...args: Parameters<T>) => {
    try {
      await fn(...args)
    } catch (err) {
      if (err instanceof CliError) process.exit(1)
      throw err
    }
  }
}

const program = new Command()

program
  .name('piut')
  .description('Build your AI brain instantly. Deploy it as an MCP server. Connect it to every project.')
  .version(VERSION)
  .hook('preAction', () => checkForUpdate(VERSION))
  .action(interactiveMenu)

program
  .command('build')
  .description('Build or rebuild your brain from your files')
  .option('-k, --key <key>', 'API key')
  .option('--folders <paths>', 'Comma-separated folder paths to scan')
  .action(withExit(buildCommand))

program
  .command('deploy')
  .description('Publish your MCP server (requires paid account)')
  .option('-k, --key <key>', 'API key')
  .action(withExit(deployCommand))

program
  .command('connect')
  .description('Add brain references to project config files')
  .option('-k, --key <key>', 'API key')
  .option('-y, --yes', 'Skip interactive prompts')
  .option('--folders <paths>', 'Comma-separated folder paths to scan')
  .action(withExit(connectCommand))

program
  .command('disconnect')
  .description('Remove brain references from project config files')
  .option('-y, --yes', 'Skip interactive prompts')
  .option('--folders <paths>', 'Comma-separated folder paths to scan')
  .action(withExit(disconnectCommand))

program
  .command('setup')
  .description('Auto-detect and configure AI tools (MCP config)')
  .option('-k, --key <key>', 'API key (prompts interactively if not provided)')
  .option('-t, --tool <id>', 'Configure a single tool (claude-code, cursor, windsurf, etc.)')
  .option('-y, --yes', 'Skip interactive prompts (auto-select all detected tools)')
  .option('--project', 'Prefer project-local config files')
  .option('--skip-skill', 'Skip skill.md file placement')
  .action(withExit(setupCommand))

program
  .command('status')
  .description('Show brain, deployment, and connected projects')
  .action(statusCommand)

program
  .command('remove')
  .description('Remove all pıut configurations')
  .action(withExit(removeCommand))

program
  .command('logout')
  .description('Remove saved API key')
  .action(logoutCommand)

program.parse()
