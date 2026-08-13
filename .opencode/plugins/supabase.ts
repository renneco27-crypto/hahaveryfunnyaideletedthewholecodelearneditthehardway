import { tool } from "@opencode-ai/plugin"
import { readFile } from "fs/promises"
import { join } from "path"

// parseEnv() - minimal .env parser (KEY=VALUE, ignores comments/quotes)
function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
  }
  return out
}

// loadConfig() - read SUPABASE_URL + service role key from project .env (or process env)
async function loadConfig(worktree: string) {
  const file = await readFile(join(worktree, ".env"), "utf-8").catch(() => "")
  const env = parseEnv(file)
  const url = (env.SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "")
  const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  const mgmt = env.SUPABASE_MANAGEMENT_TOKEN || process.env.SUPABASE_MANAGEMENT_TOKEN || ""
  return { url, key, mgmt }
}

// qsFilters() - build PostgREST equality filter string from a plain object
function qsFilters(filters: Record<string, unknown> | undefined): string {
  if (!filters) return ""
  const parts = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(String(v))}`)
  return parts.length ? "?" + parts.join("&") : ""
}

// req() - one PostgREST request with service role headers
async function req(url: string, key: string, path: string, init: RequestInit) {
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  }
  const res = await fetch(`${url}/rest/v1${path}`, { ...init, headers })
  const text = await res.text()
  if (!res.ok) return `[ERROR ${res.status}] ${text}`
  return text ? JSON.stringify(JSON.parse(text), null, 2) : "[OK]"
}

const supabaseTable = tool({
  description:
    "Query or modify a Supabase table via PostgREST using the service role key from the project .env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Operations: select / insert / update / delete.",
  args: {
    operation: tool.schema
      .enum(["select", "insert", "update", "delete"])
      .describe("select (GET), insert (POST), update (PATCH), delete (DELETE)"),
    table: tool.schema.string().describe("Table name, e.g. registered_ips"),
    columns: tool.schema
      .string()
      .optional()
      .describe('Comma-separated columns for select, e.g. "id,email,ip_address"'),
    filters: tool.schema
      .record(tool.schema.string(), tool.schema.unknown())
      .optional()
      .describe("Equality filters for select/update/delete: column -> value"),
    body: tool.schema
      .record(tool.schema.string(), tool.schema.unknown())
      .optional()
      .describe("Row data (insert) or columns to change (update)"),
    limit: tool.schema.number().optional().describe("Max rows to return (select)"),
  },
  async execute({ operation, table, columns, filters, body, limit }, { worktree }) {
    const { url, key } = await loadConfig(worktree)
    if (!url || !key)
      return "[ERROR] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env"
    try {
      if (operation === "select") {
        const cols = columns || "*"
        const lim = limit ? `&limit=${limit}` : ""
        return await req(url, key, `/${table}?select=${encodeURIComponent(cols)}${qsFilters(filters).replace("?", "&")}${lim}`, { method: "GET" })
      }
      if (operation === "insert") {
        return await req(url, key, `/${table}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify(body || {}),
        })
      }
      if (operation === "update") {
        return await req(url, key, `/${table}${qsFilters(filters)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify(body || {}),
        })
      }
      return await req(url, key, `/${table}${qsFilters(filters)}`, {
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      })
    } catch (e) {
      return `[ERROR] ${(e as Error).message}`
    }
  },
})

const supabaseSql = tool({
  description:
    "Run raw SQL (including DDL like CREATE TABLE) against a Supabase project via the Management API. Requires SUPABASE_MANAGEMENT_TOKEN (sbp_...) in the project .env — a service role key alone cannot run SQL.",
  args: {
    sql: tool.schema.string().describe("SQL statement to execute, e.g. CREATE TABLE ..."),
  },
  async execute({ sql }, { worktree }) {
    const { url, mgmt } = await loadConfig(worktree)
    if (!mgmt)
      return "[ERROR] SUPABASE_MANAGEMENT_TOKEN (sbp_...) is not set in .env. Paste it in and restart opencode."
    const ref = url.replace(/^https?:\/\//, "").replace(/\.supabase\.co.*$/, "")
    if (!ref) return "[ERROR] SUPABASE_URL not found in .env"
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mgmt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      })
      const text = await res.text()
      if (!res.ok) return `[ERROR ${res.status}] ${text}`
      return text ? text : "[OK]"
    } catch (e) {
      return `[ERROR] ${(e as Error).message}`
    }
  },
})

export default async () => ({ tool: { supabase_table: supabaseTable, supabase_sql: supabaseSql } })
