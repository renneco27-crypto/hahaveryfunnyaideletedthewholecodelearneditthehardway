# AGENTS.md

# OPENCODE, KILO, ANTIGRAVITY,CLINE MEMORY DIRECTIVE

## 1. PRE-TASK RECALL BEFORE SEARCHING
- Read `memory/functions.md` before using `grep`, searching the codebase, or writing code.
- Use it to locate functions, architecture, and file relationships.
- Only search the codebase if the answer is not in memory.

---

# 1. CORE PRINCIPLES & STRICT RULES

- Follow the user's instructions exactly.
- Execute only what was requested.
- No guessing. if going in circles stop or taking too long to think.
- No trial-and-error editing.
- If stuck, stop and hand control back to the user with:
  - the exact error,
  - suspected line range,
  - manual instructions.
- Do not perform unnecessary background analysis.
- Keep responses concise.

---

# 2. GIT SAFETY

## Ask About Git First

- Before working on a project, ask whether it is inside a Git repository.
- Without Git, mistakes may not be recoverable.

## Git Branch Discipline

- Always use `main`.
- Never use `master`.

Before implementing new features ask:

> Should I create a feature branch for this?

If yes:

- Create `feature/<short-description>`.

If no:

- Commit directly to `main`.

After approval:

- Merge into `main`.
- Delete the feature branch.

---

# 3. FILE ACCESS RULES

## Single File Focus

- Only open the file explicitly named by the user.
- Do not inspect unrelated files.

## No Repo Scanning

Do NOT perform:

- broad repository scans
- dependency analysis
- workspace traversal
- glob searches

## Direct Targeting

Fix only the file and line numbers supplied by the editor.

---

# 4. MANDATORY DIAGNOSTIC WORKFLOW

Always perform these steps first.

## Step 1: PowerShell Pre-Check

Run the custom PowerShell checker on the target file.

## Step 2: Fast Syntax Validation

```bash
node --check path/to/file.js
```

## Step 3: Indentation Scope Algorithm

If braces or scope are broken:

- Do NOT manually inspect the file.
- Run the Python brace checker from `/pySlick`.

---

# 5. AUTO DEBUG

If you notice yourself:

- reading the same files repeatedly,
- repeating tool calls,
- looping without progress,

STOP.

Insert debug logging:

```js
console.log("DEBUG:" + JSON.stringify(...));
```

Run.

Inspect.

Fix.

Remove logs.

If nothing executes:

- Add `try/catch`.
- Add `console.error`.

---

# 6. RESPECT .GITIGNORE

Before any file tree scan:

- Read `.gitignore`.
- Exclude ignored paths.
- Never traverse ignored folders.

Examples:

- node_modules
- .next
- dist
- build
- .env

Also:

- Check `.npmrc` for secrets.
- Ensure `tsconfig.tsbuildinfo` is ignored.

---

# 7. SMART FILE READING

## First Read

Use `read`.

## Subsequent Reads

Use `smart_read`.

## Large Files (>300 lines)

Use `semantic_chunk`.

## Comparing Versions

Use `semantic_diff`.

---

# 8. COMMENT-FIRST CODING

Every function should begin with:

```ts
// functionName() - what it does
```

---

# 9. OUTPUT COMPRESSION (PONYTAIL STYLE)

Before writing code ask:

- Does this feature need to exist?
- Does JavaScript, the browser, or the standard library already solve it?

Avoid:

- unnecessary packages
- unnecessary abstractions
- long implementations

Keep code concise.

Do not skip error handling.

---

# 10. MODULARITY

- Keep files under approximately 600 lines.
- Split oversized files.
- Minimize cross-file dependencies.

---

# 11. LONG TOOL CALLS

Never execute:

- pnpm install
- pnpm add
- pnpm build

or similar long-running commands.

Instead:

- Tell the user exactly what to run.
- Wait.

Always use `pnpm`.

---

# 12. SQL RULES

Always store SQL inside:

```
supabase/
```

Place:

- schema
- migrations
- seeds
- functions

inside that directory.

Never scatter SQL files.

---

# 13. UNIQUE FILE NAMES

Never reuse filenames like:

```
route.ts
```

Prefer:

- book_route.ts
- upload_route.ts
- article_route.ts

---

# 14. REPOSITORY MAP

Maintain `memory/functions.md`.

Under:

```
## Repository Map
```

Include:

- complete file tree
- exclude ignored files
- update on creation
- update on deletion
- compact after each session

---

# 15. MEMORY LOGGING

After solving a problem or adding functionality:

Automatically append to:

```
memory/functions.md
```

Do not ask permission.

Format:

```text
### relative/file/path

Keywords

Function Names

Description
```