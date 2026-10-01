import { expect, test, type Page } from "@playwright/test";
import { loadState, queryJson, userRows, type Tenant } from "./support";

const login = async (page: Page, tenant: Tenant) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(tenant.email);
  await page.getByLabel("Contraseña").fill(tenant.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/(dashboard)?$/);
};

test("authenticated tenant navigation, task lifecycle and isolation", async ({ page }) => {
  const { tenants } = await loadState();
  const [primary, foreign] = tenants;
  expect(await userRows(primary, "projects", "select=id,name")).toHaveLength(1);
  await login(page, primary);
  for (const route of ["/dashboard", "/projects", "/tasks", "/expenses", "/settings"]) {
    await page.goto(route);
    await expect(page.locator("body")).not.toContainText("Something went wrong");
    await expect(page.locator("main").first()).toBeVisible();
  }
  await page.goto("/projects");
  await expect(page.getByText(`${primary.name} Project`)).toBeVisible();
  await expect(page.getByText(`${foreign.name} Project`)).toHaveCount(0);
  await page.goto(`/projects/${foreign.projectId}`);
  await expect(page.locator("body")).not.toContainText(`${foreign.name} Project`);

  await page.goto("/tasks");
  await page.getByRole("button", { name: "Open quick actions" }).click();
  await page.getByRole("button", { name: "Add Task" }).click();
  const create = page.getByRole("dialog");
  await create.locator("input").nth(0).fill("E2E browser task");
  await create.getByRole("button", { name: "Sin asignar" }).click();
  await page.getByText(`${primary.name} Worker`, { exact: true }).click();
  await create.locator('input[type="date"]').first().fill("2026-09-01");
  await create.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("E2E browser task")).toBeVisible();
  const tasks = queryJson(`select id,due_time,assigned_worker_id from public.tasks where company_id='${primary.companyId}' and title='E2E browser task'`);
  expect(tasks).toHaveLength(1);
  expect(tasks[0].due_time).toMatch(/^09:00/);
  expect(tasks[0].assigned_worker_id).toBe(primary.workerId);

  await page.getByText("E2E browser task").click();
  const edit = page.getByRole("dialog");
  await edit.locator("input").first().fill("E2E browser task edited");
  await edit.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Completado" }).click();
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("E2E browser task edited")).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByText(/pendiente de configuración administrativa/i).first()).toBeVisible();
  await page.getByRole("button", { name: /sign out|cerrar sesión/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("body")).not.toContainText(primary.name);
});

test("offline receipt survives reload, syncs once and remains tenant isolated", async ({ page, context }) => {
  const { tenants } = await loadState();
  const [primary, foreign] = tenants;
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => sessionStorage.getItem("e2e-offline") !== "1" });
  });
  await login(page, primary);
  await page.goto("/expenses");
  const input = page.locator('input[type="file"][capture="environment"]');
  await expect(input).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => { sessionStorage.setItem("e2e-offline", "1"); window.dispatchEvent(new Event("offline")); });
  await input.setInputFiles({ name: "e2e-receipt.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  await expect(page.getByText("Guardado en dispositivo")).toBeVisible();
  const queued = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("trifecta-offline-v2", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const q = request.result.transaction("receipt-drafts").objectStore("receipt-drafts").count(); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); };
  }));
  expect(queued).toBe(1);
  await page.reload();
  expect(await page.evaluate(() => new Promise<number>((resolve) => { const r=indexedDB.open("trifecta-offline-v2",1); r.onsuccess=()=>{const q=r.result.transaction("receipt-drafts").objectStore("receipt-drafts").count();q.onsuccess=()=>resolve(q.result)}; }))).toBe(1);
  await page.evaluate(() => { sessionStorage.removeItem("e2e-offline"); window.dispatchEvent(new Event("online")); window.dispatchEvent(new Event("online")); });
  await expect(page.getByText("Recibo pendiente guardado en Trifecta")).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => new Promise<number>((resolve) => { const r=indexedDB.open("trifecta-offline-v2",1); r.onsuccess=()=>{const q=r.result.transaction("receipt-drafts").objectStore("receipt-drafts").count();q.onsuccess=()=>resolve(q.result)}; }))).toBe(0);
  const receipts = queryJson(`select id,file_hash from public.receipts where company_id='${primary.companyId}'`);
  expect(receipts).toHaveLength(1);
  await page.reload();
  expect(queryJson(`select id from public.receipts where company_id='${primary.companyId}'`)).toHaveLength(1);
  expect(queryJson(`select id from public.receipts where company_id='${foreign.companyId}'`)).toHaveLength(0);
});

test("legacy offline receipt upgrades lazily and syncs exactly once", async ({ page, context }) => {
  const { tenants } = await loadState();
  const [primary] = tenants;
  const before = queryJson(`select id from public.receipts where company_id='${primary.companyId}'`).length;
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => sessionStorage.getItem("e2e-offline") !== "1" });
  });
  await login(page, primary);
  await page.evaluate(() => sessionStorage.setItem("e2e-offline", "1"));
  await page.goto("/expenses");
  await page.waitForLoadState("networkidle");
  await page.evaluate(({ userId, companyId }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("trifecta-offline-v2", 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => request.result.createObjectStore("receipt-drafts", { keyPath: "id" });
    request.onsuccess = () => {
      const tx = request.result.transaction("receipt-drafts", "readwrite");
      tx.objectStore("receipt-drafts").put({
        id: "legacy-e2e-draft",
        idempotencyKey: "legacy-e2e-key",
        userId,
        companyId,
        file: new Blob(["legacy receipt bytes"], { type: "image/jpeg" }),
        generatedName: "legacy-e2e.jpg",
        type: "image/jpeg",
        createdAt: "2026-08-01T00:00:00.000Z",
        attempts: 0,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  }), { userId: primary.userId, companyId: primary.companyId });

  await page.evaluate(() => {
    sessionStorage.removeItem("e2e-offline");
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.getByText("Recibo pendiente guardado en Trifecta")).toBeVisible({ timeout: 20_000 });
  const remaining = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("trifecta-offline-v2", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const count = request.result.transaction("receipt-drafts").objectStore("receipt-drafts").count();
      count.onsuccess = () => resolve(count.result);
      count.onerror = () => reject(count.error);
    };
  }));
  expect(remaining).toBe(0);
  expect(queryJson(`select id from public.receipts where company_id='${primary.companyId}'`)).toHaveLength(before + 1);
  await page.reload();
  expect(queryJson(`select id from public.receipts where company_id='${primary.companyId}'`)).toHaveLength(before + 1);
});
