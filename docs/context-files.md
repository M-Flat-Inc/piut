# Find Your Context Files

Already using AI tools? You probably have context scattered across them. Here's where to find it so you can import it into pıut.

## AI Chatbots

### ChatGPT

**Custom Instructions**
- Location: Settings > Personalization > Customize ChatGPT ([direct link](https://chatgpt.com/#settings/Personalization))
- Format: Plain text
- Steps:
  1. Click your profile icon in the bottom-left corner
  2. Go to Settings > Personalization > Customize ChatGPT
  3. Copy the text from both fields: "What would you like ChatGPT to know about you?" and "How would you like ChatGPT to respond?"
  4. Paste both into your pıut context

**Memory**
- Location: Settings > Personalization > Memory > Manage ([direct link](https://chatgpt.com/#settings/Personalization))
- Format: Plain text
- Steps:
  1. Click your profile icon > Settings > Personalization > Memory
  2. Click "Manage" to see all stored memories
  3. Copy individual memory items, or start a new chat and ask: "Give me a complete export of everything you know about me"
  4. Paste the output into your pıut context
- Tip: ChatGPT has no bulk export button for memories. The prompt trick is the fastest way to get everything at once.

**Full Data Export**
- Location: Settings > Data Controls > Export Data ([direct link](https://chatgpt.com/#settings/DataControls))
- Format: ZIP (JSON + HTML)
- Steps:
  1. Click your profile icon > Settings > Data Controls
  2. Click "Export Data" and confirm
  3. Wait for an email with a download link (can take up to 48 hours)
  4. The ZIP contains conversations.json with your full chat history
- Tip: The export includes all conversations, custom instructions, and metadata. The conversations.json file can be large.

**Custom GPT Instructions**
- Location: Explore GPTs > My GPTs > Edit > Configure ([direct link](https://chatgpt.com/gpts/mine))
- Format: Plain text
- Steps:
  1. Go to Explore GPTs > My GPTs
  2. Click on a GPT you created, then click "Edit"
  3. Go to the "Configure" tab
  4. Copy the instructions text from the Instructions field

---

### Claude.ai

**Project Instructions**
- Location: Project > Settings (gear icon) > Project Instructions
- Format: Markdown / Plain text
- Steps:
  1. Open a Project in Claude.ai
  2. Click the gear icon to open Project Settings
  3. Select all text in the "Project Instructions" field and copy it
  4. Paste into your pıut context
- Tip: Projects are available on Pro, Team, and Enterprise plans. Each project can also have uploaded Knowledge files — download those separately.

**Data Export**
- Location: Settings > Privacy > Export Data ([direct link](https://claude.ai/settings))
- Format: JSON (emailed)
- Steps:
  1. Click your initials in the bottom-left corner
  2. Go to Settings > Privacy
  3. Click "Export Data"
  4. Check your email for a download link (expires in 24 hours)
- Tip: Data export is only available from the desktop website, not mobile apps.

---

### Google Gemini

**Custom Instructions**
- Location: Settings > Personal Intelligence > Instructions for Gemini ([direct link](https://gemini.google.com/app/settings))
- Format: Plain text
- Steps:
  1. Go to gemini.google.com
  2. Click the gear icon (bottom-left) > Settings and help
  3. Go to Personal Intelligence > Instructions for Gemini
  4. Copy the text from the instructions field
- Tip: On mobile: open the Gemini app > tap your profile picture > Personal Intelligence > Instructions for Gemini.

**Gems Instructions**
- Location: Gem manager (left sidebar) > Edit
- Format: Plain text
- Steps:
  1. Open gemini.google.com and click "Gem manager" in the left sidebar
  2. Click on a Gem you created, then click "Edit"
  3. Copy the system instruction text
  4. Repeat for each Gem you want to export
- Tip: There is no bulk export for Gems — you must copy each one individually.

**Conversation History**
- Location: [takeout.google.com](https://takeout.google.com) > Gemini Apps
- Format: HTML in ZIP
- Steps:
  1. Go to takeout.google.com
  2. Click "Deselect all"
  3. Scroll down and select "Gemini Apps" (not just "Gemini" which is Gems configs)
  4. Click "Next step" and export

---

### Microsoft Copilot

**Custom Instructions & Memory**
- Location: Profile icon > Settings > Personalization
- Format: Plain text
- Steps:
  1. Click your profile icon in the top-right corner
  2. Go to Settings > Personalization
  3. Copy the text from the Custom Instructions field
  4. Review any stored Memory items and copy relevant ones
- Tip: Copilot Memory is on by default since July 2025. There is no dedicated export — you must copy manually from settings.

---

### Perplexity AI

**AI Profile**
- Location: Profile icon > Settings > AI Profile ([direct link](https://www.perplexity.ai/settings/account))
- Format: Plain text
- Steps:
  1. Click your profile icon in the top-right corner
  2. Go to Settings > AI Profile (left sidebar)
  3. Make sure the profile is activated (click "Activate" if not)
  4. Copy the text from the self-introduction/bio and response preference fields
- Tip: On mobile: Settings > scroll to bottom > AI Profile.

---

### Grok (xAI)

**Memory**
- Location: Settings > Data Controls
- Format: Plain text
- Steps:
  1. Go to Settings > Data Controls
  2. View your stored memories
  3. Copy individual memory items manually
- Tip: Grok Memory is in beta and not available in the EU/UK. There are no custom instructions — all personalization comes from Memory.

---

## Coding Assistants

### Claude Code

**CLAUDE.md Files**
- Location: `~/.claude/CLAUDE.md`, `./CLAUDE.md`, `./CLAUDE.local.md`
- Format: Markdown
- Steps:
  1. Check your home directory for a global file: `~/.claude/CLAUDE.md`
  2. Check your project root for: `CLAUDE.md` (shared) and `CLAUDE.local.md` (personal)
  3. Claude Code also searches parent directories — check those too
  4. Copy the contents of any CLAUDE.md files you find
- Tip: CLAUDE.md is case-sensitive and must be exactly "CLAUDE.md". The .local.md variant is git-ignored for personal overrides.

---

### Cursor

**Project Rules**
- Location: `.cursor/rules/` directory in project root
- Format: MDC (Markdown with metadata)
- Steps:
  1. Open your project root in a file explorer
  2. Look for the `.cursor/rules/` directory
  3. Copy all `.mdc` files inside — these are your project rules

**Legacy .cursorrules**
- Location: `.cursorrules` in project root
- Format: Plain text / Markdown
- Steps:
  1. Check your project root for a `.cursorrules` file
  2. If it exists, copy its contents — this is the deprecated format still supported by Cursor

**Global Rules**
- Location: Cursor Settings > General > Rules for AI
- Format: Plain text
- Steps:
  1. Open Cursor Settings
  2. Go to General > Rules for AI
  3. Copy the text from the rules field

---

### Windsurf

**Project Rules**
- Location: `.windsurf/rules/` directory in project root
- Format: Markdown
- Steps:
  1. Open your project root in a file explorer
  2. Look for the `.windsurf/rules/` directory
  3. Copy all `.md` files — the primary file is usually `rules.md`
- Tip: Windsurf limits rules to 6,000 chars per file and 12,000 chars total.

**Global Rules**
- Location: Windsurf Settings > Rules > `global_rules.md`
- Format: Markdown
- Steps:
  1. Open Windsurf Settings
  2. Navigate to the Rules section
  3. Copy the contents of `global_rules.md`

---

### GitHub Copilot

**Repository Instructions**
- Location: `.github/copilot-instructions.md`
- Format: Markdown
- Steps:
  1. Check your repository root for `.github/copilot-instructions.md`
  2. Copy the file contents — this is auto-attached to all Copilot Chat requests
- Tip: Code review only reads the first 4,000 characters. Check the "References" list in a Copilot response to confirm the file was used.

**Scoped Instruction Files**
- Location: `*.instructions.md` (anywhere in repo)
- Format: Markdown with YAML frontmatter
- Steps:
  1. Search your repo for files ending in `.instructions.md`
  2. These can be anywhere in the repo and use `applyTo` globs to scope to specific file types
  3. Copy each file you find

---

### Aider

**Conventions File**
- Location: `CONVENTIONS.md` in project root
- Format: Markdown
- Steps:
  1. Check your project root for `CONVENTIONS.md`
  2. If you use a custom path, check your `.aider.conf.yml` for the `conventions-file` setting
  3. Copy the file contents

**AGENTS.md**
- Location: `AGENTS.md` in project root
- Format: Markdown
- Steps:
  1. Check your project root for `AGENTS.md` — this is the emerging cross-tool standard
  2. Copy the file contents
- Tip: AGENTS.md is supported by multiple tools (Aider, Roo Code, and growing). Like `.editorconfig` but for AI instructions.

---

### Cline

**Project Rules**
- Location: `.clinerules/` directory in project root
- Format: Markdown
- Steps:
  1. Check your project root for a `.clinerules/` directory
  2. Copy all `.md` files inside (e.g., `01-coding-style.md`, `02-testing.md`)
  3. Also check for a legacy single `.clinerules` file in the project root
- Tip: The old "Custom Instructions" text box in Cline settings is deprecated in favor of `.clinerules` files.

---

### Roo Code

**Workspace Rules**
- Location: `.roo/rules/` directory in workspace root
- Format: Markdown or plain text
- Steps:
  1. Check your workspace root for `.roo/rules/`
  2. Also check for mode-specific directories like `.roo/rules-code/`
  3. Copy all `.md` and `.txt` files you find

**AGENTS.md**
- Location: `AGENTS.md` (or `AGENT.md`) in workspace root
- Format: Markdown
- Steps:
  1. Check your workspace root for `AGENTS.md` or `AGENT.md`
  2. This file is auto-loaded by Roo Code on startup
  3. Copy the file contents

**Global Rules**
- Location: `~/.roo/rules/` in home directory
- Format: Markdown or plain text
- Steps:
  1. Check `~/.roo/rules/` for global rules that apply to all workspaces
  2. Copy any files you find — workspace rules override global ones
