import fs from 'fs'
import path from 'path'

export const SKILL_SNIPPET = `## p\u0131ut Context

This project uses p\u0131ut for persistent personal context.
Skill reference: https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md

Always call \`get_context\` at the start of a conversation to understand the user.
Read the \`soul\` section first \u2014 it contains behavioral instructions for how to interact.
Use \`update_brain\` for substantial new information, \`append_brain\` for quick notes.`

/** Skill snippet for connect command — references local .piut/skill.md instead of GitHub URL */
export const PROJECT_SKILL_SNIPPET = `## p\u0131ut Context
This project uses p\u0131ut for persistent personal context.
Full skill reference: .piut/skill.md

Always call \`get_context\` at the start of every conversation.
Read the \`soul\` section first \u2014 it contains behavioral instructions.
Use \`update_brain\` for substantial new info, \`append_brain\` for quick notes.`

const SEPARATOR = '\n\n---\n\n'

/** Write or append skill snippet to a rules file. */
export function placeSkillFile(filePath: string): { created: boolean; appended: boolean } {
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)

  try {
    const existing = fs.readFileSync(absPath, 'utf-8')
    if (existing.includes('p\u0131ut Context')) {
      return { created: false, appended: false }
    }
    fs.appendFileSync(absPath, SEPARATOR + SKILL_SNIPPET + '\n')
    return { created: false, appended: true }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      fs.mkdirSync(path.dirname(absPath), { recursive: true })
      fs.writeFileSync(absPath, SKILL_SNIPPET + '\n', 'utf-8')
      return { created: true, appended: false }
    }
    throw err
  }
}
