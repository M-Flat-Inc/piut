import fs from 'fs'
import path from 'path'

export const SKILL_SNIPPET = `## p\u0131ut Context (MCP Server: piut)

This project uses p\u0131ut for persistent personal context via MCP (Model Context Protocol).
p\u0131ut provides MCP tools \u2014 do NOT read local .piut/ files directly. Use the MCP tools.

### Available MCP Tools
- \`get_context\` \u2014 Fetch all 5 brain sections. CALL THIS FIRST in every conversation.
- \`get_section\` \u2014 Fetch a single section (about, soul, areas, projects, memory)
- \`search_brain\` \u2014 Search across all sections
- \`append_brain\` \u2014 Append text to a section (no AI processing)
- \`update_brain\` \u2014 AI-powered integration of new info into brain
- \`prompt_brain\` \u2014 Execute natural language commands against context

### Instructions
1. Call \`get_context\` at conversation start to load the user's brain
2. Read the \`soul\` section first \u2014 it contains behavioral instructions
3. Use \`update_brain\` for substantial new info, \`append_brain\` for quick notes
4. Never read .piut/config.json directly \u2014 always use the MCP tools

Skill reference: https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md`

/** Skill snippet for connect command — references local .piut/skill.md instead of GitHub URL */
export const PROJECT_SKILL_SNIPPET = `## p\u0131ut Context (MCP Server: piut)

This project uses p\u0131ut for persistent personal context via MCP (Model Context Protocol).
p\u0131ut provides MCP tools \u2014 do NOT read local .piut/ files directly. Use the MCP tools.

### Available MCP Tools
- \`get_context\` \u2014 Fetch all 5 brain sections. CALL THIS FIRST in every conversation.
- \`get_section\` \u2014 Fetch a single section (about, soul, areas, projects, memory)
- \`search_brain\` \u2014 Search across all sections
- \`append_brain\` \u2014 Append text to a section (no AI processing)
- \`update_brain\` \u2014 AI-powered integration of new info into brain
- \`prompt_brain\` \u2014 Execute natural language commands against context

### Instructions
1. Call \`get_context\` at conversation start to load the user's brain
2. Read the \`soul\` section first \u2014 it contains behavioral instructions
3. Use \`update_brain\` for substantial new info, \`append_brain\` for quick notes
4. Never read .piut/config.json directly \u2014 always use the MCP tools

Full skill reference: .piut/skill.md`

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
