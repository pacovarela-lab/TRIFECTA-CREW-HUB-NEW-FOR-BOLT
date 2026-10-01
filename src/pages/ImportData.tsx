import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Download, CheckCircle2, AlertCircle } from "lucide-react";
import { csvToObjects, downloadCSV, toCSV } from "@/lib/csv";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ImportType = "expenses" | "payments" | "workers" | "clients" | "vendors";

const TEMPLATES: Record<ImportType, { headers: string[]; sample: Record<string, string>; description: string }> = {
  expenses: {
    headers: ["spent_on", "amount", "category", "vendor", "project", "description"],
    sample: { spent_on: "2026-01-15", amount: "120.50", category: "Materials", vendor: "Home Depot", project: "Smith Kitchen", description: "Tile" },
    description: "Date format YYYY-MM-DD. Category, vendor and project will be auto-created if they don't exist.",
  },
  payments: {
    headers: ["received_on", "amount", "client", "project", "method", "notes"],
    sample: { received_on: "2026-01-20", amount: "5000", client: "John Smith", project: "Smith Kitchen", method: "check", notes: "Deposit" },
    description: "Method must be one of: cash, check, transfer, card, other.",
  },
  workers: {
    headers: ["name", "phone", "email", "trade", "worker_type"],
    sample: { name: "Carlos Ruiz", phone: "555-1234", email: "carlos@example.com", trade: "Plumber", worker_type: "worker" },
    description: "worker_type: worker or subcontractor.",
  },
  clients: {
    headers: ["name", "email", "phone", "address", "notes"],
    sample: { name: "Acme Corp", email: "billing@acme.com", phone: "555-9999", address: "123 Main St", notes: "" },
    description: "Only name is required.",
  },
  vendors: {
    headers: ["name", "notes"],
    sample: { name: "Home Depot", notes: "Net 30" },
    description: "Only name is required.",
  },
};

const ImportData = () => {
  const [type, setType] = useState<ImportType>("expenses");
  const [results, setResults] = useState<{ ok: number; skipped: number; errors: { row: number; msg: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const t = TEMPLATES[type];
    downloadCSV(`${type}_template.csv`, toCSV([t.sample], t.headers as any));
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setResults(null);
    try {
      const text = await file.text();
      const rows = csvToObjects(text);
      if (!rows.length) { toast.error("Empty file"); return; }
      const ctx = await getContext();
      const errors: { row: number; msg: string }[] = [];
      let ok = 0;

      // Preload lookups
      const lookups = await loadLookups(ctx.companyId);

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          if (type === "expenses") await importExpense(r, ctx, lookups);
          else if (type === "payments") await importPayment(r, ctx, lookups);
          else if (type === "workers") await importWorker(r, ctx);
          else if (type === "clients") await importClient(r, ctx);
          else if (type === "vendors") await importVendor(r, ctx);
          ok++;
        } catch (e: any) {
          errors.push({ row: i + 2, msg: e.message ?? "Unknown error" });
        }
      }
      setResults({ ok, skipped: 0, errors });
      toast.success(`Imported ${ok} of ${rows.length}`);
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2">
        <Upload className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Bulk Import</h1>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">1. Pick what to import</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={type} onValueChange={(v) => { setType(v as ImportType); setResults(null); }}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="expenses">Expenses</SelectItem>
              <SelectItem value="payments">Payments</SelectItem>
              <SelectItem value="workers">Workers</SelectItem>
              <SelectItem value="clients">Clients</SelectItem>
              <SelectItem value="vendors">Vendors</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{TEMPLATES[type].description}</p>
          <Button variant="outline" onClick={downloadTemplate} className="h-11 w-full">
            <Download className="mr-2 h-4 w-4" /> Download CSV template
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">2. Upload your CSV</CardTitle></CardHeader>
        <CardContent>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <Button onClick={() => fileRef.current?.click()} disabled={busy} className="h-12 w-full text-base">
            <Upload className="mr-2 h-5 w-5" /> {busy ? "Importing…" : "Choose CSV file"}
          </Button>
        </CardContent>
      </Card>

      {results && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Results</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-success"><CheckCircle2 className="h-4 w-4" /> {results.ok} imported successfully</div>
            {results.errors.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-destructive"><AlertCircle className="h-4 w-4" /> {results.errors.length} failed</div>
                <ul className="mt-2 max-h-64 space-y-1 overflow-auto rounded-lg border border-border bg-muted/30 p-2 text-xs">
                  {results.errors.map((e, i) => <li key={i}>Row {e.row}: {e.msg}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ======== Helpers ========

const getContext = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
  if (!profile?.company_id) throw new Error("No company");
  return { companyId: profile.company_id, userId: user.id };
};

const loadLookups = async (companyId: string) => {
  const [cats, vendors, projects, clients, divisions] = await Promise.all([
    supabase.from("categories").select("id, name").eq("company_id", companyId),
    supabase.from("vendors").select("id, name").eq("company_id", companyId),
    supabase.from("projects").select("id, name, division_id").eq("company_id", companyId),
    supabase.from("clients").select("id, name").eq("company_id", companyId),
    supabase.from("divisions").select("id, name").eq("company_id", companyId),
  ]);
  return {
    categories: new Map((cats.data ?? []).map((c) => [c.name.toLowerCase(), c])),
    vendors: new Map((vendors.data ?? []).map((v) => [v.name.toLowerCase(), v])),
    projects: new Map((projects.data ?? []).map((p) => [p.name.toLowerCase(), p])),
    clients: new Map((clients.data ?? []).map((c) => [c.name.toLowerCase(), c])),
    divisions: divisions.data ?? [],
  };
};

const findOrCreate = async (table: "categories" | "vendors" | "clients", name: string, companyId: string, map: Map<string, any>) => {
  const key = name.toLowerCase();
  if (map.has(key)) return map.get(key);
  const payload: any = { name, company_id: companyId };
  if (table === "categories") payload.kind = "expense";
  const { data, error } = await supabase.from(table).insert(payload).select("id, name").single();
  if (error) throw new Error(`Could not create ${table.slice(0, -1)} "${name}": ${error.message}`);
  map.set(key, data);
  return data;
};

const parseAmount = (s: string) => {
  const n = Number(String(s).replace(/[^0-9.\-]/g, ""));
  if (!isFinite(n)) throw new Error(`Invalid amount: ${s}`);
  return n;
};

const importExpense = async (r: Record<string, string>, ctx: { companyId: string; userId: string }, l: Awaited<ReturnType<typeof loadLookups>>) => {
  if (!r.amount) throw new Error("Missing amount");
  const amount = parseAmount(r.amount);
  let project_id: string | null = null;
  let division_id: string | null = l.divisions[0]?.id ?? null;
  if (r.project) {
    const proj = l.projects.get(r.project.toLowerCase());
    if (!proj) throw new Error(`Project "${r.project}" not found`);
    project_id = proj.id;
    division_id = proj.division_id;
  }
  if (!division_id) throw new Error("No division available");
  const category = r.category ? await findOrCreate("categories", r.category, ctx.companyId, l.categories) : null;
  const vendor = r.vendor ? await findOrCreate("vendors", r.vendor, ctx.companyId, l.vendors) : null;
  const { error } = await supabase.from("expenses").insert({
    company_id: ctx.companyId, division_id, project_id,
    amount, spent_on: r.spent_on || new Date().toISOString().slice(0, 10),
    category_id: category?.id ?? null, vendor_id: vendor?.id ?? null,
    description: r.description || null, created_by: ctx.userId,
  });
  if (error) throw new Error(error.message);
};

const importPayment = async (r: Record<string, string>, ctx: { companyId: string; userId: string }, l: Awaited<ReturnType<typeof loadLookups>>) => {
  if (!r.amount) throw new Error("Missing amount");
  const amount = parseAmount(r.amount);
  let project_id: string | null = null;
  let division_id: string | null = l.divisions[0]?.id ?? null;
  let client_id: string | null = null;
  if (r.project) {
    const proj = l.projects.get(r.project.toLowerCase());
    if (!proj) throw new Error(`Project "${r.project}" not found`);
    project_id = proj.id;
    division_id = proj.division_id;
  }
  if (r.client) {
    const c = await findOrCreate("clients", r.client, ctx.companyId, l.clients);
    client_id = c.id;
  }
  if (!division_id) throw new Error("No division available");
  const method = (r.method || "other").toLowerCase();
  const allowed = ["cash", "check", "transfer", "card", "other"];
  if (!allowed.includes(method)) throw new Error(`Invalid method "${r.method}"`);
  const { error } = await supabase.from("payments").insert({
    company_id: ctx.companyId, division_id, project_id, client_id,
    amount, received_on: r.received_on || new Date().toISOString().slice(0, 10),
    method: method as any, notes: r.notes || null, created_by: ctx.userId,
  });
  if (error) throw new Error(error.message);
};

const importWorker = async (r: Record<string, string>, ctx: { companyId: string }) => {
  if (!r.name) throw new Error("Missing name");
  const wt = (r.worker_type || "worker").toLowerCase();
  if (!["worker", "subcontractor"].includes(wt)) throw new Error(`Invalid worker_type "${r.worker_type}"`);
  const { error } = await supabase.from("workers").insert({
    company_id: ctx.companyId, name: r.name, phone: r.phone || null, email: r.email || null,
    trade: r.trade || null, worker_type: wt as any, active: true,
  });
  if (error) throw new Error(error.message);
};

const importClient = async (r: Record<string, string>, ctx: { companyId: string }) => {
  if (!r.name) throw new Error("Missing name");
  const { error } = await supabase.from("clients").insert({
    company_id: ctx.companyId, name: r.name,
    email: r.email || null, phone: r.phone || null, address: r.address || null, notes: r.notes || null,
  });
  if (error) throw new Error(error.message);
};

const importVendor = async (r: Record<string, string>, ctx: { companyId: string }) => {
  if (!r.name) throw new Error("Missing name");
  const { error } = await supabase.from("vendors").insert({
    company_id: ctx.companyId, name: r.name, notes: r.notes || null,
  });
  if (error) throw new Error(error.message);
};

export default ImportData;
