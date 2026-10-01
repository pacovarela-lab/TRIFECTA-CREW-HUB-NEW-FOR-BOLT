export const isDashboardTenantEmpty = ({
  businessUnitId,
  projectCount,
  spent,
  collected,
}: {
  businessUnitId: string;
  projectCount: number;
  spent: number;
  collected: number;
}): boolean => businessUnitId === "__all" && projectCount === 0 && spent === 0 && collected === 0;
