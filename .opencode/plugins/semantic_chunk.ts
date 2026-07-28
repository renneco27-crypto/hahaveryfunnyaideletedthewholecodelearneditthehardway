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

    // Try to load TypeScript grammar
    try {
      const tsWasm = require.resolve("tree-sitter-typescript/tree-sitter-typescript.wasm")
      tsLanguageTs = await Parser.default.Language.load(tsWasm)
    } catch { /* TS grammar not available */ }

    // Try to load Python grammar
    try {
      const pyWasm = require.resolve("tree-sitter-python/tree-sitter-python.wasm")
      tsLanguagePy = await Parser.default.Language.load(pyWasm)
    } catch { /* Python grammar not available */ }
  } catch {
    tsParser = null // web-tree-sitter not installed
  }
  return tsParser
}

// ── Heuristic fallback (same as before) ────────────────────────────
function heuristicChunk(content: string) {
  const lines = content.split("\n")
  const chunks: Array<{ type: string; name: string; code: string; startLine: number; endLine: number }> = []
  const fnRE = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/
  const classRE = /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/
  const methodRE = /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/
  const ifaceRE = /^\s*(?:export\s+)?interface\s+(\w+)/

  let braceDepth = 0
  let current: { type: string; name: string; startLine: number; code: string[] } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (!current) {
      let match: RegExpMatchArray | null
      let type = "", name = ""

      if ((match = line.match(fnRE))) { type = "function"; name = match[1] }
      else if ((match = line.match(classRE))) { type = "class"; name = match[1] }
      else if ((match = line.match(ifaceRE))) { type = "interface"; name = match[1] }
      else if ((match = line.match(methodRE)) && braceDepth > 0) { type = "method"; name = match[1] }

      if (type) {
        current = { type, name, startLine: i + 1, code: [line] }
        braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
        continue
      }
    } else {
      current.code.push(line)
      braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
      if (braceDepth <= 0) {
        chunks.push({
          type: current.type,
          name: current.name,
          code: current.code.join("\n"),
          startLine: current.startLine,
          endLine: i + 1,
        })
        current = null; braceDepth = 0
      }
    }
  }
  if (current) {
    chunks.push({
      type: current.type, name: current.name,
      code: current.code.join("\n"),
      startLine: current.startLine, endLine: lines.length,
    })
  }
  return chunks
}

// ── Tree-sitter AST chunker ───────────────────────────────────────
function tsChunk(content: string, lang: any) {
  tsParser!.setLanguage(lang)
  const tree = tsParser!.parse(content)
  const root = tree.rootNode
  const chunks: Array<{ type: string; name: string; code: string; startLine: number; endLine: number }> = []

  function walk(node: any) {
    let type = ""
    let name = ""

    if (node.type === "function_declaration" || node.type === "function_definition") {
      type = "function"
      const n = node.childForFieldName("name")
      if (n) name = n.text
    } else if (node.type === "class_declaration" || node.type === "class_definition") {
      type = "class"
      const n = node.childForFieldName("name")
      if (n) name = n.text
    } else if (node.type === "method_definition") {
      type = "method"
      const n = node.childForFieldName("name")
      if (n) name = n.text
    } else if (node.type === "interface_declaration" || node.type === "struct_specifier") {
      type = "interface"
      const n = node.childForFieldName("name")
      if (n) name = n.text
    }

    if (type) {
      chunks.push({
        type,
        name,
        code: node.text,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      })
    }

    for (let i = 0; i < node.childCount; i++) walk(node.child(i))
  }

  for (let i = 0; i < root.childCount; i++) walk(root.child(i))
  return chunks
}

// ── Tool definition ───────────────────────────────────────────────
export default tool({
  description: "Parse a file into semantic chunks (functions, classes, methods). Uses Tree-sitter AST if available, falls back to heuristic brace-matching.",
  args: {
    filePath: tool.schema.string().describe("Path to the file (relative to worktree)"),
  },
  async execute({ filePath }, { worktree }) {
    const absPath = join(worktree, filePath)
    let content: string
    try {
      content = await readFile(absPath, "utf-8")
    } catch {
      return `[ERROR] File not found: ${absPath}`
    }

    const ext = extname(filePath).toLowerCase()
    await initTreeSitter()

    let chunks: Array<any>

    if (tsParser && ((ext === ".ts" || ext === ".tsx") && tsLanguageTs) || (ext === ".py" && tsLanguagePy)) {
      const lang = ext === ".py" ? tsLanguagePy : tsLanguageTs
      chunks = tsChunk(content, lang)
    } else {
      chunks = heuristicChunk(content)
    }

    if (chunks.length === 0) return `[INFO] No semantic chunks found in ${filePath}`
    return JSON.stringify({ file: filePath, totalChunks: chunks.length, chunks }, null, 2)
  },
})
