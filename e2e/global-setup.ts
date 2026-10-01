import { saveState, seedTenant, sql } from "./support";

export default async function globalSetup() {
  sql("delete from auth.users where email like 'e2e-%@local.invalid'; delete from public.companies where slug like 'e2e-%'");
  const tenants = [];
  for (const label of ["trifecta", "prospect-1", "prospect-2"]) tenants.push(await seedTenant(label));
  await saveState({ tenants });
}
