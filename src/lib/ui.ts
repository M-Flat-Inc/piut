import chalk from 'chalk'

export const brand = chalk.hex('#8B5CF6')
export const success = chalk.green
export const warning = chalk.yellow
export const error = chalk.red
export const dim = chalk.dim

export function banner(): void {
  console.log()
  console.log(brand.bold('  p\u0131ut') + dim(' \u2014 personal context for AI'))
  console.log()
}

export function toolLine(name: string, status: string, icon: string): void {
  console.log(`  ${icon} ${name.padEnd(20)} ${status}`)
}

// ---------------------------------------------------------------------------
// Animated spinner with live stats for long-running operations
// ---------------------------------------------------------------------------
const SPINNER_FRAMES = ['\u28CB', '\u28D9', '\u28F9', '\u28F8', '\u28FC', '\u28F4', '\u28E6', '\u28E7', '\u28C7', '\u28CF']

export class Spinner {
  private frame = 0
  private interval: ReturnType<typeof setInterval> | null = null
  private startTime = Date.now()
  private message = ''
  private sections: string[] = []
  private currentSection: string | null = null

  start(message: string): void {
    this.message = message
    this.startTime = Date.now()
    this.sections = []
    this.currentSection = null
    this.render()
    this.interval = setInterval(() => this.render(), 80)
  }

  addSection(name: string): void {
    // Complete the previous section
    if (this.currentSection) {
      this.clearLine()
      const elapsed = this.elapsed()
      const label = this.capitalize(this.currentSection)
      console.log(`  ${success('\u2713')} ${label.padEnd(14)} ${dim(elapsed)}`)
    }
    this.currentSection = name
    this.sections.push(name)
    this.message = `Building ${this.capitalize(name)}...`
  }

  completeAll(): void {
    // Complete the last in-progress section
    if (this.currentSection) {
      this.clearLine()
      const elapsed = this.elapsed()
      const label = this.capitalize(this.currentSection)
      console.log(`  ${success('\u2713')} ${label.padEnd(14)} ${dim(elapsed)}`)
      this.currentSection = null
    }
    this.message = 'Finalizing...'
  }

  updateMessage(message: string): void {
    this.message = message
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.clearLine()
    if (finalMessage) {
      console.log(finalMessage)
    }
  }

  private render(): void {
    this.frame = (this.frame + 1) % SPINNER_FRAMES.length
    const spinner = brand(SPINNER_FRAMES[this.frame])
    const elapsed = dim(this.elapsed())
    this.clearLine()
    process.stdout.write(`  ${spinner} ${this.message}  ${elapsed}`)
  }

  private elapsed(): string {
    const ms = Date.now() - this.startTime
    if (ms < 1000) return '<1s'
    return `${Math.floor(ms / 1000)}s`
  }

  private clearLine(): void {
    process.stdout.write('\r\x1b[K')
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
}
