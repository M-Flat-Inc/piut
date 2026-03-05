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
