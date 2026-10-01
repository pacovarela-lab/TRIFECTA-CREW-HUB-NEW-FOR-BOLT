import { rm } from "node:fs/promises";
import { sql, statePath } from "./support";

export default async function globalTeardown() {
  try {
    sql("delete from auth.users where email like 'e2e-%@local.invalid'; delete from public.companies where slug like 'e2e-%'");
  } finally {
    await rm(statePath, { force: true });
  }
}
