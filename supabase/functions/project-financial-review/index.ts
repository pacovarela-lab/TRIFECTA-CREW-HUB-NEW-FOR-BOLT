// Edge function: generates AI-powered financial recommendations for a project.
// Reuses the existing OPENAI_API_KEY already configured in the project.
// Only receives financial deviation data (no sensitive raw data).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DeviationInput {
  area: string;
  status: string;
  budget: number;
  actual: number;
  deviation: number;
  deviation_pct: number;
  message: string;
}

interface RequestBody {
  projectName: string;
  overallStatus: string;
  deviations: DeviationInput[];
  margin: { budgeted: number; actual: number; deviation: number };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RequestBody = await req.json();
    if (!body.deviations || body.deviations.length === 0) {
      return new Response(JSON.stringify({ recommendations: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const AI_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!AI_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const deviationsText = body.deviations
      .filter((d) => d.status !== "green")
      .map((d) => {
        return `- ${d.area}: plan $${Math.round(d.budget)}, real $${Math.round(d.actual)}, desviación $${Math.round(d.deviation)} (${Math.round(d.deviation_pct * 100)}%). Estado: ${d.status}. ${d.message}`;
      })
      .join("\n");

    const marginText = `Margen proyectado: $${Math.round(body.margin.budgeted)}, margen actual: $${Math.round(body.margin.actual)}, desviación: $${Math.round(body.margin.deviation)}.`;

    const systemPrompt = `Eres un asistente financiero para constructores. Analizas desviaciones de presupuesto y generas recomendaciones prácticas en español simple, sin lenguaje contable complejo.
Debes devolver EXACTAMENTE un JSON con esta estructura:
{
  "recommendations": [
    {
      "area": "materials|labor|other|collections|margin",
      "severity": "orange|red",
      "explanation": "qué cambió, en 1-2 oraciones simples",
      "problem_area": "descripción breve del problema en lenguaje simple",
      "margin_impact": número,
      "recommended_actions": [
        { "type": "charge_more|reduce_expense|review_labor|collect_balance|reclassify", "label": "acción concreta en español" }
      ]
    }
  ]
}
Reglas:
- Máximo 3 recomendaciones.
- Cada recomendación debe tener máximo 3 acciones.
- Usa lenguaje simple, no contable. Ej: "Mano de obra está $620 arriba del plan".
- margin_impact es un número que representa cuánto afecta al margen (puede ser negativo).
- Solo incluye áreas con estado naranja o rojo.`;

    const userPrompt = `Proyecto: ${body.projectName}
Estado general: ${body.overallStatus}
Desviaciones:
${deviationsText}
${marginText}

Genera las recomendaciones.`;

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit. Intenta en un momento." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "Sin créditos de IA. Contacta al administrador." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      throw new Error(`AI gateway ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const content = aiData.choices[0]?.message?.content;
    if (!content) {
      return new Response(JSON.stringify({ recommendations: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(content);
    const recommendations = (parsed.recommendations ?? []).slice(0, 3).map((r: any) => ({
      area: r.area,
      severity: r.severity,
      explanation: r.explanation,
      problem_area: r.problem_area,
      margin_impact: Number(r.margin_impact) || 0,
      recommended_actions: (r.recommended_actions ?? []).slice(0, 3).map((a: any) => ({
        type: a.type,
        label: a.label,
      })),
    }));

    return new Response(JSON.stringify({ recommendations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("project-financial-review error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
