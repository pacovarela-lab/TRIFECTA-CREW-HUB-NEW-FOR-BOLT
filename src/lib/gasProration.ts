export type GasProject = {
  id: string;
  name: string;
  estimated_total: number | null;
};

export type GasSplit = {
  project_id: string;
  amount: number;
  percentage: number;
};

const GAS_CATEGORY_PATTERNS = /gasolina|combustible|veh[ií]culo|gas\s*station|fuel/i;

export function isGasCategory(categoryName: string | null | undefined): boolean {
  if (!categoryName) return false;
  return GAS_CATEGORY_PATTERNS.test(categoryName);
}

export function computeGasProration(
  totalExpense: number,
  activeProjects: GasProject[],
): { splits: GasSplit[]; error: string | null } {
  if (!totalExpense || totalExpense <= 0) {
    return { splits: [], error: "El monto del gasto debe ser mayor a 0." };
  }

  const eligible = activeProjects.filter(
    (p) => p.estimated_total != null && Number(p.estimated_total) > 0,
  );

  if (eligible.length === 0) {
    return {
      splits: [],
      error: "No hay trabajos activos con valor de contrato para prorratear.",
    };
  }

  const sumContracts = eligible.reduce(
    (sum, p) => sum + Number(p.estimated_total!),
    0,
  );

  if (sumContracts <= 0) {
    return {
      splits: [],
      error: "La suma de contratos activos es 0. No se puede prorratear.",
    };
  }

  const rawSplits = eligible.map((p) => {
    const ratio = Number(p.estimated_total!) / sumContracts;
    const exact = totalExpense * ratio;
    const rounded = Math.round(exact * 100) / 100;
    return {
      project_id: p.id,
      amount: rounded,
      percentage: Math.round(ratio * 10000) / 100,
    };
  });

  // Fix rounding: adjust the last split so the sum is exactly totalExpense
  const assignedSum = rawSplits.reduce((s, r) => s + r.amount, 0);
  const diff = Math.round((totalExpense - assignedSum) * 100) / 100;
  if (diff !== 0 && rawSplits.length > 0) {
    rawSplits[rawSplits.length - 1].amount =
      Math.round((rawSplits[rawSplits.length - 1].amount + diff) * 100) / 100;
  }

  return { splits: rawSplits, error: null };
}
