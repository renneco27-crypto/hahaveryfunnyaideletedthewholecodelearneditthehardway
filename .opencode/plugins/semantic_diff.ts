import { tool } from "@opencode-ai/plugin"
import { readFile } from "fs/promises"
import { join, extname } from "path"

// ── Lazy Tree-sitter initializer ──────────────────────────────────
let tsParser: any = null
let tsLanguageTs: any = null
let tsLanguagePy: any = null
let tsInitAttempted = false

async function initTreeSitter() {
  if (tsInitAttempted) return tsParser
  tsInitAttempted = true
  try {
    const Parser = await import("web-tree-sitter")
    await Parser.default.init()
    tsParser = new Parser.default()
    try {
      const tsWasm = require.resolve("tree-sitter-typescript/tree-sitter-typescript.wasm")
      tsLanguageTs = await Parser.default.Language.load(tsWasm)
    } catch { /* TS grammar not available */ }
    try {
      const pyWasm = require.resolve("tree-sitter-python/tree-sitter-python.wasm")
      tsLanguagePy = await Parser.default.Language.load(pyWasm)
    } catch { /* Python grammar not available */ }
  } catch { tsParser = null }
  return tsParser
}

// ── Heuristic name extraction ─────────────────────────────────────
function heuristicNames(content: string): Map<string, { type: string; code: string }> {
  const map = new Map<string, { type: string; code: string }>()
  const fnRE = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm
  const classRE = /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm
  const ifaceRE = /^\s*(?:export\s+)?interface\s+(\w+)/gm

  let m: RegExpExecArray | null
  while ((m = fnRE.exec(content)) !== null) {
    const idx = m.index
    const end = blockEnd(content, idx)
    map.set("function:" + m[1], { type: "function", code: content.slice(idx, end) })
  }
  while ((m = classRE.exec(content)) !== null) {
    const idx = m.index
    const end = blockEnd(content, idx)
    map.set("class:" + m[1], { type: "class", code: content.slice(idx, end) })
  }
  while ((m = ifaceRE.exec(content)) !== null) {
    const idx = m.index
    const end = blockEnd(content, idx)
    map.set("interface:" + m[1], { type: "interface", code: content.slice(idx, end) })
  }
  return map
}

function blockEnd(content: string, start: number): number {
  let depth = 0, inBlock = false
  for (let i = start; i < content.length; i++) {
    if (content[i] === "{") { depth++; inBlock = true }
    else if (content[i] === "}") { depth-- }
    if (inBlock && depth === 0) return i + 1
  }
  return content.length
}

// ── AST name extraction ───────────────────────────────────────────
function tsNames(content: string, lang: any): Map<string, { type: string; code: string }> {
  tsParser!.setLanguage(lang)
  const tree = tsParser!.parse(content)
  const root = tree.rootNode
  const map = new Map<string, { type: string; code: string }>()

  function walk(node: any) {
    let prefix = ""
    const n = node.childForFieldName("name")

    if (node.type === "function_declaration" || node.type === "function_definition") {
      prefix = "function:"
    } else if (node.type === "class_declaration" || node.type === "class_definition") {
      prefix = "class:"
    } else if (node.type === "interface_declaration") {
      prefix = "interface:"
    }

    if (prefix && n) {
      map.set(prefix + n.text, { type: prefix.slice(0, -1), code: node.text })
    }

    for (let i = 0; i < node.childCount; i++) walk(node.child(i))
  }

  for (let i = 0; i < root.childCount; i++) walk(root.child(i))
  return map
}

// ── Tool definition ───────────────────────────────────────────────
export default tool({
  description: "Compare structural changes between two file versions. Detects added, removed, and modified functions/classes/interfaces using Tree-sitter AST or heuristic fallback.",
  args: {
    filePath: tool.schema.string().describe("Path to the file (relative to worktree)"),
    ref: tool.schema.string().optional().describe("Git ref to compare against (e.g. HEAD, main)"),
  },
  async execute({ filePath, ref }, { worktree, $ }) {
    const absPath = join(worktree, filePath)
    let newContent: string
    try {
      newContent = await readFile(absPath, "utf-8")
    } catch {
      return `[ERROR] File not found: ${absPath}`
    }

    let oldContent: string | null = null
    if (ref) {
      try {
        const result = await $`git show ${ref}:${filePath}`.quiet().nothrow()
        if (result.exitCode === 0) oldContent = result.text()
      } catch { /* git ref not available */ }
    }

    if (!oldContent) {
      return `[INFO] No reference version available for ${filePath}. Provide a ref (e.g. HEAD) to compare against git history.`
    }

    const ext = extname(filePath).toLowerCase()
    await initTreeSitter()

    let oldSymbols: Map<string, { type: string; code: string }>
    let newSymbols: Map<string, { type: string; code: string }>

    const useTs = tsParser && ((ext === ".ts" || ext === ".tsx") && tsLanguageTs) || (ext === ".py" && tsLanguagePy)
    const lang = ext === ".py" ? tsLanguagePy : tsLanguageTs

    if (useTs) {
      oldSymbols = tsNames(oldContent, lang)
      newSymbols = tsNames(newContent, lang)
    } else {
      oldSymbols = heuristicNames(oldContent)
      newSymbols = heuristicNames(newContent)
    }

    const added: string[] = []
    const removed: string[] = []
    const modified: string[] = []

    for (const [key, sym] of newSymbols) {
      if (!oldSymbols.has(key)) added.push(key)
      else if (oldSymbols.get(key)!.code !== sym.code) modified.push(key)
    }
    for (const key of oldSymbols.keys()) {
      if (!newSymbols.has(key)) removed.push(key)
    }

    const mode = useTs ? "ast" : "heuristic"
    return JSON.stringify({ file: filePath, comparedAgainst: ref || "unknown", mode, changes: { added, removed, modified } }, null, 2)
  },
})
