"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns3,
  Database,
  Filter,
  Inbox,
  Plus,
  RefreshCw,
  Search as SearchIcon,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, FIXED_COLUMNS, fixedKey, flatten, isFixedKey, matchesFilter, OPERATORS, type FieldFilter, type Operator, type StoredEvent } from "@/lib/events";

const PAGE_SIZES = [10, 25, 50, 100];
let filterSeq = 0;

type Row = StoredEvent & { flat: Record<string, string>; search: string };

export function EventsDashboard() {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filters, setFilters] = useState<FieldFilter[]>([]);
  const [sortDesc, setSortDesc] = useState(true);
  const [columns, setColumns] = useState<string[]>([]);
  const [columnsTouched, setColumnsTouched] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newBody, setNewBody] = useState('{\n  "type": "example"\n}');

  const load = useCallback(async (silent = false) => {
    try {
      setEvents(await api.list());
      setError(null);
    } catch (e) {
      setError(`Could not reach the backend (${(e as Error).message}). Is it running on port 4000?`);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => load(true), 3000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const rows: Row[] = useMemo(
    () =>
      events.map((e) => ({
        ...e,
        flat: flatten(e.body),
        search: `${e.id} ${JSON.stringify(e.body)}`.toLowerCase(),
      })),
    [events],
  );

  const keyStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) for (const k of Object.keys(r.flat)) counts.set(k, (counts.get(k) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const allKeys = useMemo(() => keyStats.map(([k]) => k), [keyStats]);

  // Default columns: the most common keys, until the user picks their own.
  useEffect(() => {
    if (!columnsTouched) setColumns(allKeys.filter((k) => !isFixedKey(k)).slice(0, 3));
  }, [allKeys, columnsTouched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromMs = from ? new Date(from).getTime() : -Infinity;
    const toMs = to ? new Date(to).getTime() : Infinity;
    const out = rows.filter((r) => {
      const t = new Date(r.createdAt).getTime();
      if (t < fromMs || t > toMs) return false;
      if (q && !r.search.includes(q)) return false;
      return filters.every((f) => matchesFilter(r.flat, f));
    });
    out.sort((a, b) => (sortDesc ? -1 : 1) * a.createdAt.localeCompare(b.createdAt));
    return out;
  }, [rows, search, from, to, filters, sortDesc]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const hasActiveFilters = !!(search || from || to || filters.length);

  function resetFilters() {
    setSearch("");
    setFrom("");
    setTo("");
    setFilters([]);
    setPage(0);
  }

  function updateFilter(id: number, patch: Partial<FieldFilter>) {
    setFilters((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    setPage(0);
  }

  function toggleColumn(key: string) {
    setColumnsTouched(true);
    setColumns((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));
  }

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
      await load(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const deleteOne = (id: string) =>
    run(async () => {
      await api.remove(id);
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, "Event deleted");

  const deleteSelected = () =>
    run(async () => {
      const ids = [...selected];
      await api.removeMany(ids);
      setSelected(new Set());
    }, `Deleted ${selected.size} event(s)`);

  const clearAll = () =>
    run(async () => {
      await api.clear();
      setSelected(new Set());
      setConfirmClear(false);
    }, "All events cleared");

  async function addEvent() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(newBody);
    } catch {
      toast.error("Body is not valid JSON");
      return;
    }
    await run(() => api.create(parsed), "Event created");
    setAddOpen(false);
  }

  const last24h = events.filter((e) => Date.now() - new Date(e.createdAt).getTime() < 86_400_000).length;
  const latest = events.reduce<string | null>((m, e) => (!m || e.createdAt > m ? e.createdAt : m), null);
  const stats = [
    { label: "Total events", value: events.length, icon: Database },
    { label: "Matching filters", value: filtered.length, icon: Filter },
    { label: "Last 24 hours", value: last24h, icon: Clock },
    { label: "Latest event", value: latest ? timeAgo(latest) : "—", icon: Activity },
  ];

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      <header className="shrink-0 border-b bg-background">
        <div className="flex h-14 w-full items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Database className="size-4" />
            </div>
            <span className="font-semibold tracking-tight">Events Store</span>
            <span
              className={`ml-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${
                error ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              <span className={`size-1.5 rounded-full ${error ? "bg-destructive" : "bg-emerald-500"}`} />
              {error ? "Offline" : "Connected"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              <Checkbox checked={autoRefresh} onCheckedChange={(c) => setAutoRefresh(!!c)} />
              Live
            </label>
            <Button variant="outline" size="sm" onClick={() => load(true)}>
              <RefreshCw /> Refresh
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus /> New event
            </Button>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                {s.label}
                <s.icon className="size-4" />
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight">{s.value}</div>
            </div>
          ))}
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
          {/* Toolbar */}
          <div className="space-y-3 border-b p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-60 flex-1">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={search}
                  placeholder="Search id or anything in the body…"
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <Input
                type="datetime-local"
                className="w-auto"
                aria-label="Created from"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(0);
                }}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="datetime-local"
                className="w-auto"
                aria-label="Created to"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(0);
                }}
              />
              <Button
                variant="outline"
                disabled={!allKeys.length}
                onClick={() =>
                  setFilters((f) => [...f, { id: ++filterSeq, key: allKeys[0] ?? "", op: "contains", value: "" }])
                }
              >
                <Plus /> Filter
              </Button>
              <Button variant="outline" disabled={!allKeys.length} onClick={() => setColumnsOpen((o) => !o)}>
                <Columns3 /> Columns
              </Button>
              {hasActiveFilters && (
                <Button variant="ghost" onClick={resetFilters}>
                  <X /> Reset
                </Button>
              )}
            </div>

            {filters.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-2">
                <Select value={f.key} onValueChange={(v) => updateFilter(f.id, { key: v ?? "" })}>
                  <SelectTrigger className="w-56 bg-background">
                    <SelectValue placeholder="Field" />
                  </SelectTrigger>
                  <SelectContent>
                    {allKeys.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={f.op} onValueChange={(v) => updateFilter(f.id, { op: (v ?? "contains") as Operator })}>
                  <SelectTrigger className="w-36 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {f.op !== "exists" && (
                  <Input
                    className="w-56 bg-background"
                    value={f.value}
                    placeholder="Value"
                    onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                  />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove filter"
                  onClick={() => setFilters((fs) => fs.filter((x) => x.id !== f.id))}
                >
                  <X />
                </Button>
              </div>
            ))}

            {columnsOpen && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/50 p-2">
                {keyStats.filter(([k]) => !isFixedKey(k)).map(([k, n]) => (
                  <Badge
                    key={k}
                    variant={columns.includes(k) ? "default" : "outline"}
                    className="cursor-pointer bg-background data-[variant=default]:bg-primary"
                    onClick={() => toggleColumn(k)}
                  >
                    {k} <span className="opacity-60">{n}</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Bulk actions */}
          {(selected.size > 0 || events.length > 0) && (
            <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2 text-sm">
              {selected.size > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium">{selected.size} selected</span>
                  <Button variant="destructive" size="sm" onClick={deleteSelected}>
                    <Trash2 /> Delete selected
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                    Clear selection
                  </Button>
                </div>
              ) : (
                <span className="text-muted-foreground">
                  Showing {filtered.length} of {events.length} events
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 /> Clear all
              </Button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto [&_[data-slot=table-container]]:overflow-visible">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={(c) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        pageRows.forEach((r) => (c ? n.add(r.id) : n.delete(r.id)));
                        return n;
                      })
                    }
                  />
                </TableHead>
                <TableHead className="w-8" />
                <TableHead>
                  <button
                    className="inline-flex items-center gap-1 font-medium"
                    onClick={() => setSortDesc((d) => !d)}
                  >
                    Created <ArrowUpDown className="size-3.5 text-muted-foreground" />
                  </button>
                </TableHead>
                {FIXED_COLUMNS.map((c) => (
                  <TableHead key={c.id} className="whitespace-nowrap">
                    {c.label}
                  </TableHead>
                ))}
                {columns.map((c) => (
                  <TableHead key={c} className="whitespace-nowrap font-mono text-xs">
                    {c}
                  </TableHead>
                ))}
                <TableHead>Body</TableHead>
                <TableHead className="w-12 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={columns.length + FIXED_COLUMNS.length + 5} className="py-16 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns.length + FIXED_COLUMNS.length + 5} className="py-16">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Inbox className="size-8 text-muted-foreground" />
                      <div className="font-medium">{events.length ? "No events match your filters" : "No events yet"}</div>
                      <div className="text-sm text-muted-foreground">
                        {events.length ? "Try adjusting or resetting the filters." : "POST JSON to /event to see it here."}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => {
                  const open = expanded.has(r.id);
                  return (
                    <Fragment key={r.id}>
                      <TableRow data-state={selected.has(r.id) ? "selected" : undefined}>
                        <TableCell className="pl-4">
                          <Checkbox
                            checked={selected.has(r.id)}
                            onCheckedChange={(c) =>
                              setSelected((s) => {
                                const n = new Set(s);
                                if (c) n.add(r.id);
                                else n.delete(r.id);
                                return n;
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="px-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label="Toggle details"
                            onClick={() =>
                              setExpanded((s) => {
                                const n = new Set(s);
                                if (n.has(r.id)) n.delete(r.id);
                                else n.add(r.id);
                                return n;
                              })
                            }
                          >
                            <ChevronRight className={`transition-transform ${open ? "rotate-90" : ""}`} />
                          </Button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap" title={r.id}>
                          <div className="text-sm font-medium">{timeAgo(r.createdAt)}</div>
                          <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</div>
                        </TableCell>
                        {FIXED_COLUMNS.map((c) => {
                          const v = r.flat[fixedKey(r.flat, c) ?? ""];
                          return (
                            <TableCell
                              key={c.id}
                              className={`max-w-52 truncate text-sm ${c.id === "session" || c.id === "deviceId" ? "font-mono text-xs" : ""}`}
                              title={v}
                            >
                              {v === undefined ? (
                                <span className="text-muted-foreground">—</span>
                              ) : c.id === "priority" ? (
                                <PriorityBadge value={v} />
                              ) : (
                                v
                              )}
                            </TableCell>
                          );
                        })}
                        {columns.map((c, i) => (
                          <TableCell key={c} className="max-w-52 truncate text-sm" title={r.flat[c]}>
                            {r.flat[c] === undefined ? (
                              <span className="text-muted-foreground">—</span>
                            ) : i === 0 ? (
                              <Badge variant="secondary">{r.flat[c]}</Badge>
                            ) : (
                              r.flat[c]
                            )}
                          </TableCell>
                        ))}
                        <TableCell className="max-w-72 truncate font-mono text-xs text-muted-foreground">
                          {JSON.stringify(r.body)}
                        </TableCell>
                        <TableCell className="pr-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteOne(r.id)}
                            aria-label="Delete event"
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={columns.length + FIXED_COLUMNS.length + 4} className="whitespace-normal">
                            <div className="mb-1 font-mono text-xs text-muted-foreground">id: {r.id}</div>
                            <pre className="overflow-auto rounded-lg border bg-background p-3 font-mono text-xs">
                              {JSON.stringify(r.body, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              Rows per page
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              Page {safePage + 1} of {pageCount}
              <Button variant="outline" size="icon" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all events?</DialogTitle>
            <DialogDescription>This permanently deletes all {events.length} stored events.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={clearAll}>
              Clear all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New event</DialogTitle>
            <DialogDescription>Any JSON body. Posted to /event.</DialogDescription>
          </DialogHeader>
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            className="h-48 w-full rounded-md border bg-transparent p-2 font-mono text-sm"
          />
          <DialogFooter>
            <Button onClick={addEvent}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function timeAgo(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const PRIORITY_STYLES: Record<string, string> = {
  P0: "border-transparent bg-red-600 text-white",
  P1: "border-transparent bg-orange-500 text-white",
  P2: "border-transparent bg-amber-400 text-black",
  P3: "border-transparent bg-sky-500 text-white",
};

function PriorityBadge({ value }: { value: string }) {
  const label = value.trim().toUpperCase();
  return (
    <Badge variant="outline" className={`font-semibold ${PRIORITY_STYLES[label] ?? ""}`}>
      {label}
    </Badge>
  );
}
