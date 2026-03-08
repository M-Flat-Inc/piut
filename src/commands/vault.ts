import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { confirm } from '@inquirer/prompts'
import { listVaultFiles, uploadVaultFile, readVaultFile, deleteVaultFile } from '../lib/api.js'
import { readStore } from '../lib/store.js'
import { banner, success, dim, warning, brand, Spinner } from '../lib/ui.js'
import { CliError } from '../types.js'

/** Document formats that require server-side parsing (sent as base64). */
const DOCUMENT_EXTENSIONS = new Set([
  'pdf', 'docx', 'doc', 'pptx', 'pages', 'key', 'rtf', 'odt', 'odp', 'eml', 'mbox',
])

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function resolveApiKey(options: { key?: string }): string {
  const key = options.key || readStore().apiKey
  if (!key) {
    console.log(warning('  No API key found.'))
    console.log(dim('  Run ') + brand('piut login') + dim(' first, or pass --key.'))
    throw new CliError()
  }
  return key
}

// ---------------------------------------------------------------------------
// piut vault list
// ---------------------------------------------------------------------------

export async function vaultListCommand(options: { key?: string }): Promise<void> {
  const key = resolveApiKey(options)

  const data = await listVaultFiles(key)

  if (data.files.length === 0) {
    console.log(dim('  No files in vault.'))
    console.log(dim('  Upload with: ') + brand('piut vault upload <file>'))
    console.log()
    return
  }

  console.log()
  for (const file of data.files) {
    const size = dim(`(${formatSize(file.sizeBytes)})`)
    console.log(`  ${file.filename}  ${size}`)
    if (file.summary) {
      console.log(dim(`    ${file.summary}`))
    }
  }

  console.log()
  console.log(dim(`  ${data.usage.fileCount} file(s), ${formatSize(data.usage.totalBytes)} / ${formatSize(data.usage.maxBytes)} used`))
  console.log()
}

// ---------------------------------------------------------------------------
// piut vault upload <file>
// ---------------------------------------------------------------------------

export async function vaultUploadCommand(
  filePath: string,
  options: { key?: string },
): Promise<void> {
  const key = resolveApiKey(options)

  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    console.log(chalk.red(`  File not found: ${filePath}`))
    throw new CliError()
  }

  const stat = fs.statSync(resolved)
  if (!stat.isFile()) {
    console.log(chalk.red(`  Not a file: ${filePath}`))
    throw new CliError()
  }

  const filename = path.basename(resolved)
  const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() || '' : ''
  const isDocument = DOCUMENT_EXTENSIONS.has(ext)

  let content: string
  let encoding: 'base64' | 'utf8' | undefined
  if (isDocument) {
    content = fs.readFileSync(resolved).toString('base64')
    encoding = 'base64'
  } else {
    content = fs.readFileSync(resolved, 'utf-8')
  }

  const spinner = new Spinner()
  spinner.start(`Uploading ${filename}...`)

  try {
    const result = await uploadVaultFile(key, filename, content, encoding)
    spinner.stop()

    console.log(success(`  Uploaded ${result.filename}`) + dim(` (${formatSize(result.sizeBytes)})`))
    if (result.summary) {
      console.log(dim(`  ${result.summary}`))
    }
    console.log()
  } catch (err: unknown) {
    spinner.stop()
    console.log(chalk.red(`  ${(err as Error).message}`))
    throw new CliError()
  }
}

// ---------------------------------------------------------------------------
// piut vault read <filename>
// ---------------------------------------------------------------------------

export async function vaultReadCommand(
  filename: string,
  options: { key?: string; output?: string },
): Promise<void> {
  const key = resolveApiKey(options)

  try {
    const file = await readVaultFile(key, filename)

    if (options.output) {
      const outPath = path.resolve(options.output)
      fs.writeFileSync(outPath, file.content, 'utf-8')
      console.log(success(`  Saved to ${outPath}`))
      console.log()
    } else {
      console.log()
      console.log(file.content)
    }
  } catch (err: unknown) {
    console.log(chalk.red(`  ${(err as Error).message}`))
    throw new CliError()
  }
}

// ---------------------------------------------------------------------------
// piut vault delete <filename>
// ---------------------------------------------------------------------------

export async function vaultDeleteCommand(
  filename: string,
  options: { key?: string; yes?: boolean },
): Promise<void> {
  const key = resolveApiKey(options)

  if (!options.yes) {
    const confirmed = await confirm({
      message: `Delete "${filename}" from vault? This cannot be undone.`,
      default: false,
    })
    if (!confirmed) return
  }

  try {
    await deleteVaultFile(key, filename)
    console.log(success(`  Deleted ${filename}`))
    console.log()
  } catch (err: unknown) {
    console.log(chalk.red(`  ${(err as Error).message}`))
    throw new CliError()
  }
}
