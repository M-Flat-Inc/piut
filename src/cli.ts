import { Command } from 'commander'
import { setupCommand } from './commands/setup.js'
import { statusCommand } from './commands/status.js'
import { removeCommand } from './commands/remove.js'

const program = new Command()

program
  .name('piut')
  .description('Configure your AI tools to use p\u0131ut personal context')
  .version('1.0.2')

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

program.parse()
