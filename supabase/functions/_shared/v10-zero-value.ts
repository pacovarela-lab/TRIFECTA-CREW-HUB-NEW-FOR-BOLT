type ZeroValueRow = {
  Type?: string;
  "Bank Row"?: string;
  "Traceability Status"?: string;
};

export const isAllowedZeroCashWithdrawal = (
  row: ZeroValueRow,
  normalizeText: (value: unknown) => string,
  allowedStatuses: ReadonlySet<string>,
) =>
  normalizeText(row.Type) === "retiro efectivo" &&
  Boolean(normalizeText(row["Bank Row"])) &&
  allowedStatuses.has(row["Traceability Status"] ?? "");
