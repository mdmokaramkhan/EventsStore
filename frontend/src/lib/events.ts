export interface StoredEvent {
  id: string;
  createdAt: string;
  body: unknown;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  list: () => request<StoredEvent[]>("/event", { cache: "no-store" }),
  create: (body: unknown) =>
    request<StoredEvent>("/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  remove: (id: string) => request<StoredEvent>(`/event/${id}`, { method: "DELETE" }),
  removeMany: (ids: string[]) =>
    request<{ deleted: number }>(`/event?ids=${ids.map(encodeURIComponent).join(",")}`, { method: "DELETE" }),
  clear: () => request<{ deleted: number }>("/event", { method: "DELETE" }),
};

/** Flatten nested JSON into dot-path -> primitive/JSON-string pairs. */
export function flatten(value: unknown, prefix = "", out: Record<string, string> = {}) {
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as object);
    if (entries.length === 0 && prefix) out[prefix] = Array.isArray(value) ? "[]" : "{}";
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix || "(value)"] = String(value);
  }
  return out;
}

export type Operator = "contains" | "equals" | "not_equals" | "gt" | "lt" | "exists";

export interface FieldFilter {
  id: number;
  key: string;
  op: Operator;
  value: string;
}

export const OPERATORS: { value: Operator; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "exists", label: "exists" },
];

export function matchesFilter(flat: Record<string, string>, f: FieldFilter) {
  if (!f.key) return true;
  const actual = flat[f.key];
  if (f.op === "exists") return actual !== undefined;
  if (actual === undefined) return f.op === "not_equals";
  const a = actual.toLowerCase();
  const v = f.value.toLowerCase();
  switch (f.op) {
    case "contains":
      return a.includes(v);
    case "equals":
      return a === v;
    case "not_equals":
      return a !== v;
    case "gt":
    case "lt": {
      const na = Number(actual);
      const nv = Number(f.value);
      const numeric = !Number.isNaN(na) && !Number.isNaN(nv) && f.value.trim() !== "";
      const cmp = numeric ? na - nv : actual.localeCompare(f.value);
      return f.op === "gt" ? cmp > 0 : cmp < 0;
    }
  }
}

/** Always-visible columns. Keys are matched ignoring case, `-`, `_`, `.` and spaces. */
export const FIXED_COLUMNS = [
  { id: "session", label: "Session", aliases: ["session", "sessionid"] },
  { id: "deviceId", label: "Device ID", aliases: ["deviceid"] },
  { id: "appVersion", label: "App Version", aliases: ["appversion"] },
  { id: "priority", label: "Priority", aliases: ["priority"] },
] as const;

const norm = (k: string) => k.toLowerCase().replace(/[-_.\s]/g, "");

/** The flattened key an event uses for a fixed column, if any. */
export function fixedKey(flat: Record<string, string>, col: (typeof FIXED_COLUMNS)[number]) {
  return Object.keys(flat).find((k) => (col.aliases as readonly string[]).includes(norm(k)));
}

export function isFixedKey(key: string) {
  return FIXED_COLUMNS.some((c) => (c.aliases as readonly string[]).includes(norm(key)));
}
