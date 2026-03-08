import { Command } from 'commander'
import { setupCommand } from './commands/setup.js'
import { statusCommand } from './commands/status.js'
import { removeCommand } from './commands/remove.js'
import { buildCommand } from './commands/build.js'
import { deployCommand } from './commands/deploy.js'
import { connectCommand } from './commands/connect.js'
import { disconnectCommand } from './commands/disconnect.js'
import { loginCommand } from './commands/login.js'
import { logoutCommand } from './commands/logout.js'
import { updateCommand } from './commands/update.js'
import { doctorCommand } from './commands/doctor.js'
import { vaultListCommand, vaultUploadCommand, vaultReadCommand, vaultDeleteCommand } from './commands/vault.js'
import { interactiveMenu } from './commands/interactive.js'
import { checkForUpdate } from './lib/update-check.js'
import { CliError } from './types.js'

const VERSION = '3.8.0'

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
  .hook('preAction', (thisCommand, actionCommand) => {
    // Skip the auto-check when running `piut update` — it does its own check
    if (actionCommand.name() === 'update') return
    return checkForUpdate(VERSION)
  })
  .action(interactiveMenu)

program
  .command('build')
  .description('Build or rebuild your brain from your AI config files')
  .option('-k, --key <key>', 'API key')
  .option('-y, --yes', 'Auto-publish after build')
  .option('--no-publish', 'Skip publish prompt after build')
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
  .option('--verify', 'Validate API key, check tool configs, and test MCP endpoint')
  .action(withExit(statusCommand))

program
  .command('remove')
  .description('Remove all pıut configurations')
  .action(withExit(removeCommand))

program
  .command('login')
  .description('Authenticate with pıut (email, browser, or API key)')
  .action(withExit(loginCommand))

program
  .command('logout')
  .description('Remove saved API key')
  .action(logoutCommand)

program
  .command('doctor')
  .description('Diagnose and fix connection issues')
  .option('-k, --key <key>', 'API key to verify against')
  .option('--fix', 'Auto-fix stale configurations')
  .option('--json', 'Output results as JSON')
  .action(withExit(doctorCommand))

const vault = program
  .command('vault')
  .description('Manage your file vault (upload, list, read, delete)')

vault
  .command('list')
  .description('List all files in your vault')
  .option('-k, --key <key>', 'API key')
  .action(withExit(vaultListCommand))

vault
  .command('upload <file>')
  .description('Upload a file to your vault')
  .option('-k, --key <key>', 'API key')
  .action(withExit(vaultUploadCommand))

vault
  .command('read <filename>')
  .description('Read a file from your vault')
  .option('-k, --key <key>', 'API key')
  .option('-o, --output <path>', 'Save to a local file instead of printing')
  .action(withExit(vaultReadCommand))

vault
  .command('delete <filename>')
  .description('Delete a file from your vault')
  .option('-k, --key <key>', 'API key')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(withExit(vaultDeleteCommand))

program
  .command('update')
  .description('Check for and install CLI updates')
  .action(() => updateCommand(VERSION))

// Commander's built-in --version skips preAction hooks, so intercept here
// to ensure the update check runs even on `piut --version`
const args = process.argv.slice(2)
if (args.includes('--version') || args.includes('-V')) {
  console.log(VERSION)
  await checkForUpdate(VERSION)
  process.exit(0)
}

program.parse()
