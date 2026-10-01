// Asistente de consultas en lenguaje natural sobre los datos de la empresa.
// Usa tool calling con Lovable AI para extraer la intención y devuelve resultados estructurados.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QueryIntent {
  metric: "total_expenses" | "total_payments" | "expense_by_category" | "expense_by_vendor" | "expense_by_project" | "recent_expenses" | "open_tasks" | "overdue_tasks";
  period?: "today" | "this_week" | "this_month" | "this_year" | "last_30_days" | "all_time";
  filter_project?: string;
  filter_vendor?: string;
  filter_category?: string;
  limit?: number;
}

const periodToRange = (p?: string): { from?: string; to?: string } => {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date(now);
  switch (p) {
    case "today": return { from: iso(now), to: iso(now) };
    case "this_week": start.setDate(now.getDate() - now.getDay()); return { from: iso(start), to: iso(now) };
    case "this_month": start.setDate(1); return { from: iso(start), to: iso(now) };
    case "this_year": return { from: `${now.getFullYear()}-01-01`, to: iso(now) };
    case "last_30_days": start.setDate(now.getDate() - 30); return { from: iso(start), to: iso(now) };
    default: return {};
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { question } = await req.json();
    if (!question || typeof question !== "string") {
      return new Response(JSON.stringify({ error: "question required" }), { status: 400, headers: corsHeaders });
    }

    const AI_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!AI_KEY) throw new Error("OPENAI_API_KEY not configured");

    // Extraer intención con tool calling
    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Eres un asistente que traduce preguntas de negocio a una intención estructurada. Responde siempre en español." },
          { role: "user", content: question },
        ],
        tools: [{
          type: "function",
          function: {
            name: "build_query",
            description: "Estructurar la consulta en una intención conocida.",
            parameters: {
              type: "object",
              properties: {
                metric: { type: "string", enum: ["total_expenses", "total_payments", "expense_by_category", "expense_by_vendor", "expense_by_project", "recent_expenses", "open_tasks", "overdue_tasks"] },
                period: { type: "string", enum: ["today", "this_week", "this_month", "this_year", "last_30_days", "all_time"] },
                limit: { type: "number" },
              },
              required: ["metric"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "build_query" } },
      }),
    });

    if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit. Intenta en un momento." }), { status: 429, headers: corsHeaders });
    if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Sin créditos de IA. Contacta al administrador." }), { status: 402, headers: corsHeaders });
    if (!aiResp.ok) throw new Error(`AI gateway ${aiResp.status}`);

    const aiData = await aiResp.json();
    const args = JSON.parse(aiData.choices[0].message.tool_calls[0].function.arguments) as QueryIntent;
    const range = periodToRange(args.period);

    // Ejecutar consulta según métrica (RLS protege automáticamente)
    let result: any = null;
    let summary = "";

    if (args.metric === "total_expenses") {
      let q = supabase.from("expenses").select("amount");
      if (range.from) q = q.gte("spent_on", range.from);
      if (range.to) q = q.lte("spent_on", range.to);
      const { data } = await q;
      const total = (data ?? []).reduce((s, r: any) => s + Number(r.amount || 0), 0);
      result = { total, count: data?.length ?? 0 };
      summary = `Gastos totales${args.period ? ` (${args.period})` : ""}: $${total.toFixed(2)} en ${result.count} registros.`;
    } else if (args.metric === "total_payments") {
      let q = supabase.from("payments").select("amount");
      if (range.from) q = q.gte("received_on", range.from);
      if (range.to) q = q.lte("received_on", range.to);
      const { data } = await q;
      const total = (data ?? []).reduce((s, r: any) => s + Number(r.amount || 0), 0);
      result = { total, count: data?.length ?? 0 };
      summary = `Pagos recibidos: $${total.toFixed(2)} en ${result.count} transacciones.`;
    } else if (args.metric === "expense_by_category") {
      let q = supabase.from("expenses").select("amount, category_id, categories(name)");
      if (range.from) q = q.gte("spent_on", range.from);
      if (range.to) q = q.lte("spent_on", range.to);
      const { data } = await q;
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => {
        const k = r.categories?.name ?? "Sin categoría";
        map.set(k, (map.get(k) ?? 0) + Number(r.amount || 0));
      });
      result = Array.from(map.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
      summary = `Gastos por categoría:\n${result.slice(0, 5).map((r: any) => `• ${r.name}: $${r.total.toFixed(2)}`).join("\n")}`;
    } else if (args.metric === "expense_by_vendor") {
      let q = supabase.from("expenses").select("amount, vendor_id, vendors(name)");
      if (range.from) q = q.gte("spent_on", range.from);
      if (range.to) q = q.lte("spent_on", range.to);
      const { data } = await q;
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => {
        const k = r.vendors?.name ?? "Sin proveedor";
        map.set(k, (map.get(k) ?? 0) + Number(r.amount || 0));
      });
      result = Array.from(map.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
      summary = `Top proveedores:\n${result.slice(0, 5).map((r: any) => `• ${r.name}: $${r.total.toFixed(2)}`).join("\n")}`;
    } else if (args.metric === "expense_by_project") {
      let q = supabase.from("expenses").select("amount, project_id, projects(name)");
      if (range.from) q = q.gte("spent_on", range.from);
      if (range.to) q = q.lte("spent_on", range.to);
      const { data } = await q;
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => {
        const k = r.projects?.name ?? "Sin proyecto";
        map.set(k, (map.get(k) ?? 0) + Number(r.amount || 0));
      });
      result = Array.from(map.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
      summary = `Gastos por proyecto:\n${result.slice(0, 5).map((r: any) => `• ${r.name}: $${r.total.toFixed(2)}`).join("\n")}`;
    } else if (args.metric === "recent_expenses") {
      const limit = args.limit ?? 10;
      const { data } = await supabase
        .from("expenses")
        .select("id, amount, spent_on, description, vendors(name), categories(name), projects(name)")
        .order("spent_on", { ascending: false })
        .limit(limit);
      result = data;
      summary = `Últimos ${data?.length ?? 0} gastos:\n${(data ?? []).map((r: any) => `• ${r.spent_on} · $${r.amount} · ${r.vendors?.name ?? "—"}`).join("\n")}`;
    } else if (args.metric === "open_tasks") {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, status, priority, planned_end_date, projects(name)")
        .in("status", ["pending", "in_progress"])
        .order("planned_end_date", { ascending: true })
        .limit(20);
      result = data;
      summary = `${data?.length ?? 0} tareas abiertas. Próximas:\n${(data ?? []).slice(0, 5).map((r: any) => `• ${r.title} (${r.projects?.name ?? "—"})`).join("\n")}`;
    } else if (args.metric === "overdue_tasks") {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("tasks")
        .select("id, title, planned_end_date, projects(name)")
        .in("status", ["pending", "in_progress"])
        .lt("planned_end_date", today);
      result = data;
      summary = `${data?.length ?? 0} tareas atrasadas:\n${(data ?? []).slice(0, 10).map((r: any) => `• ${r.title} · venció ${r.planned_end_date}`).join("\n")}`;
    }

    return new Response(JSON.stringify({ intent: args, summary, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-query error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
