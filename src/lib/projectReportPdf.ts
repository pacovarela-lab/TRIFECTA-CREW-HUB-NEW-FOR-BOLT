import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PRIMARY: [number, number, number] = [15, 23, 42];
const ACCENT: [number, number, number] = [225, 29, 72];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [226, 232, 240];
const BG: [number, number, number] = [248, 250, 252];
const SUCCESS: [number, number, number] = [5, 150, 105];
const DANGER: [number, number, number] = [220, 38, 38];

const usd = (n: number) =>
  `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Project = { name: string; status?: string | null; divisions?: { name?: string } | null; clients?: { name?: string } | null; address?: string | null };
type Fin = { estimateTotal?: number; spent?: number; collected?: number; profit?: number; margin?: number };
type Expense = { spent_on: string; amount: number | string; description?: string | null; categories?: { name?: string } | null; vendors?: { name?: string } | null };
type Payment = { received_on: string; amount: number | string; method?: string | null; clients?: { name?: string } | null };

export function generateProjectReportPdf(
  project: Project,
  fin: Fin,
  expenses: Expense[],
  payments: Payment[],
) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 42;

  const estimate = Number(fin.estimateTotal ?? 0);
  const spent = Number(fin.spent ?? 0);
  const collected = Number(fin.collected ?? 0);
  const profit = Number(fin.profit ?? collected - spent);
  const margin = collected > 0 ? (profit / collected) * 100 : 0;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...ACCENT);
  doc.text("PROJECT P&L REPORT", M, M);

  doc.setFontSize(22);
  doc.setTextColor(...PRIMARY);
  doc.text(project.name, M, M + 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const today = new Date().toISOString().slice(0, 10);
  const subParts = [
    project.divisions?.name ? `División: ${project.divisions.name}` : null,
    project.clients?.name ? `Cliente: ${project.clients.name}` : null,
    project.status ? `Estado: ${project.status}` : null,
    `Generado ${today}`,
  ].filter(Boolean);
  doc.text(subParts.join("  ·  "), M, M + 38);

  // KPI cards
  let y = M + 56;
  const cardW = (pageW - M * 2) / 4;
  const cardH = 56;
  const kpis: Array<[string, string, [number, number, number]]> = [
    ["ESTIMADO", usd(estimate), PRIMARY],
    ["COBRADO", usd(collected), SUCCESS],
    ["GASTADO", usd(spent), DANGER],
    ["UTILIDAD", usd(profit), profit >= 0 ? SUCCESS : DANGER],
  ];
  kpis.forEach(([label, value, color], i) => {
    const x = M + i * cardW;
    doc.setDrawColor(...LINE);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, cardW - 6, cardH, 4, 4, "FD");
    // accent edge
    doc.setFillColor(...ACCENT);
    doc.rect(x, y, 2.5, cardH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...ACCENT);
    doc.text(label, x + 12, y + 16);
    doc.setFontSize(14);
    doc.setTextColor(...color);
    doc.text(value, x + 12, y + 38);
    if (label === "UTILIDAD") {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(`margen ${margin.toFixed(1)}%`, x + 12, y + 50);
    }
  });
  y += cardH + 24;

  // Visual bars
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...ACCENT);
  doc.text("RESUMEN VISUAL", M, y);
  y += 12;
  const maxv = Math.max(estimate, collected, spent, 1);
  const barX = M + 70;
  const barMaxW = pageW - M - 90 - barX;
  const drawBar = (label: string, val: number, color: [number, number, number]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...PRIMARY);
    doc.text(label, M, y + 8);
    doc.setFillColor(...color);
    doc.rect(barX, y, barMaxW * (val / maxv), 10, "F");
    doc.setTextColor(...MUTED);
    doc.text(usd(val), pageW - M, y + 8, { align: "right" });
    y += 18;
  };
  drawBar("Estimado", estimate, PRIMARY);
  drawBar("Cobrado", collected, SUCCESS);
  drawBar("Gastado", spent, DANGER);

  y += 10;

  // Categories breakdown
  const byCat = new Map<string, number>();
  expenses.forEach((e) => {
    const k = e.categories?.name ?? "Sin categoría";
    byCat.set(k, (byCat.get(k) ?? 0) + Number(e.amount));
  });
  const catRows = Array.from(byCat.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, usd(v), `${spent ? ((v / spent) * 100).toFixed(1) : "0.0"}%`]);

  autoTable(doc, {
    startY: y,
    head: [["Categoría", "Total", "% del gasto"]],
    body: catRows.length ? catRows : [["—", "—", "—"]],
    foot: [["TOTAL", usd(spent), "100.0%"]],
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: PRIMARY },
    headStyles: { fontStyle: "bold", textColor: MUTED, lineWidth: { bottom: 0.5 }, lineColor: LINE, fontSize: 8 },
    footStyles: { fontStyle: "bold", textColor: PRIMARY, lineWidth: { top: 0.5 }, lineColor: PRIMARY },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    alternateRowStyles: { fillColor: BG },
    margin: { left: M, right: M },
    didDrawPage: () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...ACCENT);
      doc.text("GASTOS POR CATEGORÍA", M, (doc as any).lastAutoTable?.startY - 6 || y - 6);
    },
  });

  // Payments
  doc.addPage();
  let y2 = M;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...ACCENT);
  doc.text("PAGOS RECIBIDOS", M, y2);
  y2 += 14;
  doc.setFontSize(18);
  doc.setTextColor(...PRIMARY);
  doc.text("Historial de cobros", M, y2);
  y2 += 14;

  const payRows = payments
    .slice()
    .sort((a, b) => (a.received_on < b.received_on ? 1 : -1))
    .map((p) => [p.received_on, (p.method ?? "—").toString(), p.clients?.name ?? "—", usd(Number(p.amount))]);

  autoTable(doc, {
    startY: y2,
    head: [["Fecha", "Método", "Cliente", "Monto"]],
    body: payRows.length ? payRows : [["—", "—", "—", "—"]],
    foot: [["", "", "TOTAL", usd(collected)]],
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: PRIMARY },
    headStyles: { fontStyle: "bold", textColor: MUTED, lineWidth: { bottom: 0.5 }, lineColor: LINE, fontSize: 8 },
    footStyles: { fontStyle: "bold", textColor: PRIMARY, lineWidth: { top: 0.5 }, lineColor: PRIMARY },
    columnStyles: { 3: { halign: "right", textColor: SUCCESS } },
    alternateRowStyles: { fillColor: BG },
    margin: { left: M, right: M },
  });

  // Expenses detail
  const yExp = ((doc as any).lastAutoTable?.finalY ?? y2) + 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...ACCENT);
  doc.text("DETALLE DE GASTOS", M, yExp);

  const expRows = expenses
    .slice()
    .sort((a, b) => (a.spent_on < b.spent_on ? 1 : -1))
    .map((e) => [
      e.spent_on,
      e.categories?.name ?? "—",
      e.vendors?.name ?? "—",
      (e.description ?? "—").slice(0, 60),
      usd(Number(e.amount)),
    ]);

  autoTable(doc, {
    startY: yExp + 8,
    head: [["Fecha", "Categoría", "Proveedor", "Descripción", "Monto"]],
    body: expRows.length ? expRows : [["—", "—", "—", "—", "—"]],
    foot: [["", "", "", "TOTAL", usd(spent)]],
    theme: "plain",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5, textColor: PRIMARY },
    headStyles: { fontStyle: "bold", textColor: MUTED, lineWidth: { bottom: 0.5 }, lineColor: LINE, fontSize: 8 },
    footStyles: { fontStyle: "bold", textColor: PRIMARY, lineWidth: { top: 0.5 }, lineColor: PRIMARY },
    columnStyles: { 4: { halign: "right", textColor: DANGER } },
    alternateRowStyles: { fillColor: BG },
    margin: { left: M, right: M },
  });

  // Footer on each page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      `Trifecta Portal  ·  ${project.name}  ·  Página ${p} de ${pages}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: "center" },
    );
  }

  const safeName = project.name.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 60);
  const fileName = `reporte_${safeName}_${today}.pdf`;
  return { blob: doc.output("blob"), fileName };
}

export function downloadProjectReportPdf(
  project: Project,
  fin: Fin,
  expenses: Expense[],
  payments: Payment[],
) {
  const { blob, fileName } = generateProjectReportPdf(project, fin, expenses, payments);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function shareProjectReportWhatsApp(
  project: Project,
  fin: Fin,
  expenses: Expense[],
  payments: Payment[],
): Promise<void> {
  const { blob, fileName } = generateProjectReportPdf(project, fin, expenses, payments);
  const file = new File([blob], fileName, { type: "application/pdf" });
  const nav = navigator as any;
  if (nav.canShare && nav.canShare({ files: [file] })) {
    await nav.share({ files: [file], title: `Reporte ${project.name}` });
    return;
  }
  // Fallback: download PDF + open WhatsApp with message
  downloadProjectReportPdf(project, fin, expenses, payments);
  const msg = encodeURIComponent(
    `Reporte del trabajo "${project.name}" listo. Adjunta el PDF descargado.`,
  );
  window.open(`https://wa.me/?text=${msg}`, "_blank");
}
