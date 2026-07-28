import { tool } from "@opencode-ai/plugin"
import { createHash } from "crypto"
import { readFile, writeFile, mkdir, access } from "fs/promises"
import { join } from "path"
import { homedir } from "os"

const CACHE_DIR = join(homedir(), ".cache", "opencode", "smart_read")

function hashPath(filePath: string): string {
  return createHash("sha256").update(filePath).digest("hex").slice(0, 16)
}

function computeLineDiff(oldText: string, newText: string): string {
  const oldLines = oldText.split("\n")
  const newLines = newText.split("\n")
  const changes: string[] = []
  let i = 0, j = 0
  while (i < oldLines.length || j < newLines.length) {
    if (i >= oldLines.length) {
      changes.push(`+${newLines[j]}`)
      j++
    } else if (j >= newLines.length) {
      changes.push(`-${oldLines[i]}`)
      i++
    } else if (oldLines[i] === newLines[j]) {
      i++; j++
    } else {
      let found = false
      for (let k = 1; k <= 3 && i + k < oldLines.length; k++) {
        if (oldLines[i + k] === newLines[j]) {
          for (let m = 0; m < k; m++) changes.push(`-${oldLines[i + m]}`)
          i += k
          found = true
          break
        }
      }
      if (!found) {
        changes.push(`-${oldLines[i]}`)
        changes.push(`+${newLines[j]}`)
        i++; j++
      }
    }
  }
  return changes.join("\n")
}

export default tool({
  description: "Read a file with caching — full content on first read, line diff on subsequent reads (saves tokens)",
  args: {
    filePath: tool.schema.string().describe("Path to the file (relative to worktree)"),
  },
  async execute({ filePath }, { worktree }) {
    const absPath = join(worktree, filePath)
    let currentContent: string
    try {
      currentContent = await readFile(absPath, "utf-8")
    } catch {
      return `[ERROR] File not found: ${absPath}`
    }

    const currentHash = createHash("sha256").update(currentContent).digest("hex")
    const cacheKey = hashPath(absPath)
    const cacheFile = join(CACHE_DIR, `${cacheKey}.json`)

    try { await access(CACHE_DIR) } catch { await mkdir(CACHE_DIR, { recursive: true }) }

    let cached: { hash: string; content: string } | null = null
    try {
      const raw = await readFile(cacheFile, "utf-8")
      cached = JSON.parse(raw)
    } catch { /* no cache yet */ }

    if (!cached) {
      await writeFile(cacheFile, JSON.stringify({ hash: currentHash, content: currentContent }), "utf-8")
      return currentContent
    }

    if (cached.hash !== currentHash) {
      const diff = computeLineDiff(cached.content, currentContent)
      await writeFile(cacheFile, JSON.stringify({ hash: currentHash, content: currentContent }), "utf-8")
      return `[CHANGED]\n${diff}`
    }

    return `[UNCHANGED]`
  },
})
