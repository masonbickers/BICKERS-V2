import { expect, test } from "@playwright/test";

const createBooking = async (page, workflowLabel, expectedType) => {
  await page.getByRole("button", { name: workflowLabel }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Status").locator("option")).toHaveText(["Requested", "Booked"]);
  await page.getByLabel("Provider / garage").fill("Browser Test Garage");
  await page.getByLabel("Booking reference").fill(`${expectedType}-E2E`);
  await page.getByRole("button", { name: "Create booking" }).click();
  const payload = page.getByTestId("saved-maintenance-payload");
  await expect(payload).toBeVisible();
  return JSON.parse(await payload.textContent());
};

test.beforeEach(async ({ page }) => {
  await page.goto("/maintenance-e2e");
});

test("MOT booking workflow captures a canonical booked appointment", async ({ page }) => {
  const payload = await createBooking(page, "MOT workflow", "MOT");
  expect(payload.type).toBe("MOT");
  expect(payload.status).toBe("Booked");
  expect(payload.dateKeys).toEqual(["2026-08-12"]);
});

test("service booking workflow captures the service appointment", async ({ page }) => {
  const payload = await createBooking(page, "Service workflow", "SERVICE");
  expect(payload.type).toBe("SERVICE");
  expect(payload.status).toBe("Booked");
  expect(payload.cost).toBe("");
});

test("combined inspection workflow preserves exact PMI and brake identifiers", async ({ page }) => {
  await page.getByRole("button", { name: "Combined PMI/brake workflow" }).click();
  await expect(page.getByLabel("PMI inspection")).toBeChecked();
  await expect(page.getByLabel("Brake test")).toBeChecked();
  await page.getByRole("button", { name: "Create booking" }).click();
  const payload = JSON.parse(await page.getByTestId("saved-maintenance-payload").textContent());
  expect(payload.type).toBe("INSPECTION");
  expect(payload.maintenanceTypeIds).toEqual(["pmi", "brake_test"]);
});

test("requested due item becomes one confirmed booking and preserves both dates", async ({ page }) => {
  await page.getByRole("button", { name: "Requested due-item workflow" }).click();
  await expect(page.getByText("Due — not yet arranged")).toBeVisible();
  await expect(page.getByText("Legal due date: 12 August 2026")).toBeVisible();
  await page.getByRole("button", { name: "Choose workshop date" }).click();
  await expect(page.getByText("This work is legally due on")).toBeVisible();
  await page.getByRole("button", { name: "Create booking" }).click();
  await expect(page.getByRole("heading", { name: "Confirmed booking" })).toBeVisible();
  const payload = JSON.parse(await page.getByTestId("saved-maintenance-payload").textContent());
  expect(payload.id).toBe("req_service_browser");
  expect(payload.requestedRecordId).toBe("req_service_browser");
  expect(payload.status).toBe("Booked");
  expect(payload.appointmentDate).toBe("2026-08-10");
  expect(payload.sourceDueDate).toBe("2026-08-12");
  expect(payload.dateKeys).toEqual(["2026-08-10"]);
});
