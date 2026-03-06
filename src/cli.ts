import { Command } from 'commander'
import { setupCommand } from './commands/setup.js'
import { statusCommand } from './commands/status.js'
import { removeCommand } from './commands/remove.js'
import { syncCommand } from './commands/sync.js'
import { syncConfigCommand } from './commands/sync-config.js'

const program = new Command()

program
  .name('piut')
  .description('Automatic backup + hosting of all your agent configs across every machine. Version history. Restore any time. One command to set up.')
  .version('1.1.0')

program
  .command('setup', { isDefault: true })
  .description('Auto-detect and configure AI tools')
  .option('-k, --key <key>', 'API key (prompts interactively if not provided)')
  .option('-t, --tool <id>', 'Configure a single tool (claude-code, cursor, windsurf, etc.)')
  .option('-y, --yes', 'Skip interactive prompts (auto-select all detected tools)')
  .option('--project', 'Prefer project-local config files')
  .option('--skip-skill', 'Skip skill.md file placement')
  .action(setupCommand)

program
  .command('status')
  .description('Show which AI tools are configured with p\u0131ut')
  .action(statusCommand)

program
  .command('remove')
  .description('Remove p\u0131ut configuration from AI tools')
  .action(removeCommand)

const sync = program
  .command('sync')
  .description('Back up and sync your agent config files to the cloud')
  .option('--install', 'Run the guided backup setup flow')
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
  .description('Configure cloud backup settings')
  .option('--files', 'Change which files are backed up')
  .option('--auto-discover <value>', 'Auto-backup new files (on/off)')
  .option('--keep-brain-updated <value>', 'Keep brain updated from backups (on/off)')
  .option('--use-brain <value>', 'Reference centralized brain (on/off)')
  .option('--show', 'View current configuration')
  .action(syncConfigCommand)

program.parse()
