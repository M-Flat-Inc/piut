import { Command } from 'commander'
import { setupCommand } from './commands/setup.js'
import { statusCommand } from './commands/status.js'
import { removeCommand } from './commands/remove.js'
import { syncCommand } from './commands/sync.js'
import { syncConfigCommand } from './commands/sync-config.js'
import { buildCommand } from './commands/build.js'
import { deployCommand } from './commands/deploy.js'
import { connectCommand } from './commands/connect.js'
import { disconnectCommand } from './commands/disconnect.js'
import { interactiveMenu } from './commands/interactive.js'

const program = new Command()

program
  .name('piut')
  .description('Build your AI brain instantly. Deploy it as an MCP server. Connect it to every project.')
  .version('2.0.0')
  .action(interactiveMenu)

program
  .command('build')
  .description('Build or rebuild your brain from your files')
  .option('-k, --key <key>', 'API key')
  .option('--folders <paths>', 'Comma-separated folder paths to scan')
  .action(buildCommand)

program
  .command('deploy')
  .description('Publish your MCP server (requires paid account)')
  .option('-k, --key <key>', 'API key')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(deployCommand)

program
  .command('connect')
  .description('Add brain references to project config files')
  .option('-k, --key <key>', 'API key')
  .option('-y, --yes', 'Skip interactive prompts')
  .option('--folders <paths>', 'Comma-separated folder paths to scan')
  .action(connectCommand)

program
  .command('disconnect')
  .description('Remove brain references from project config files')
  .option('-y, --yes', 'Skip interactive prompts')
  .option('--folders <paths>', 'Comma-separated folder paths to scan')
  .action(disconnectCommand)

program
  .command('setup')
  .description('Auto-detect and configure AI tools (MCP config)')
  .option('-k, --key <key>', 'API key (prompts interactively if not provided)')
  .option('-t, --tool <id>', 'Configure a single tool (claude-code, cursor, windsurf, etc.)')
  .option('-y, --yes', 'Skip interactive prompts (auto-select all detected tools)')
  .option('--project', 'Prefer project-local config files')
  .option('--skip-skill', 'Skip skill.md file placement')
  .action(setupCommand)

program
  .command('status')
  .description('Show brain, deployment, and connected projects')
  .action(statusCommand)

program
  .command('remove')
  .description('Remove all pıut configurations')
  .action(removeCommand)

const sync = program
  .command('sync')
  .description('Sync your agent config files to the cloud')
  .option('--install', 'Run the guided sync setup flow')
  .option('--push', 'Push local changes to cloud')
  .option('--pull', 'Pull latest versions from cloud')
  .option('--watch', 'Watch files for changes and auto-push (live sync)')
  .option('--history <file>', 'Show version history for a file')
  .option('--diff <file>', 'Show diff between local and cloud version')
  .option('--restore <file>', 'Restore a file from a previous version')
  .option('--prefer-local', 'Resolve conflicts by keeping local version')
  .option('--prefer-cloud', 'Resolve conflicts by keeping cloud version')
  .option('--install-daemon', 'Set up auto-sync via cron/launchd')
  .option('-k, --key <key>', 'API key')
  .option('-y, --yes', 'Skip interactive prompts')
  .action(syncCommand)

sync
  .command('config')
  .description('Configure sync settings')
  .option('--files', 'Change which files are synced')
  .option('--auto-discover <value>', 'Auto-sync new files (on/off)')
  .option('--keep-brain-updated <value>', 'Keep brain updated from synced files (on/off)')
  .option('--use-brain <value>', 'Reference centralized brain (on/off)')
  .option('--show', 'View current configuration')
  .action(syncConfigCommand)

program.parse()
