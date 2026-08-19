import { expect, test } from "@playwright/test";

const report = {
  ok: true,
  accounts: [{ uid: "user-1", email: "alex@bickers.co.uk" }],
  summary: { activeMinutes: 95, outOfHoursMinutes: 35, affectedAccounts: 1, flaggedDays: 1 },
  settings: {
    enabled: true,
    idleMinutes: 10,
    flagMinutes: 15,
    policyVersion: "2026-08-11-v1",
    fallbackSchedule: {
      timezone: "Europe/London",
      days: {
        monday: { working: true, start: "08:00", end: "16:30" },
        tuesday: { working: true, start: "08:00", end: "16:30" },
        wednesday: { working: true, start: "08:00", end: "16:30" },
        thursday: { working: true, start: "08:00", end: "16:30" },
        friday: { working: true, start: "08:00", end: "16:30" },
        saturday: { working: false, start: "08:00", end: "16:30" },
        sunday: { working: false, start: "08:00", end: "16:30" },
      },
    },
  },
  rows: [{
    id: "abcdef1234567890abcdef123456", uid: "user-1", companyId: "company-a",
    email: "alex@bickers.co.uk", employeeName: "Alex Driver", linked: true,
    startAt: "2026-08-10T17:00:00Z", endAt: "2026-08-10T17:35:00Z", dateKey: "2026-08-10",
    activeMinutes: 35, inHoursMinutes: 0, outOfHoursMinutes: 35, actionCount: 2,
    category: "Jobs & quotes", workspace: "user", scheduleLabel: "08:00-16:30",
    scheduleSource: "employee", flagged: true, annotations: ["Known job activity"],
    review: { status: "unreviewed", note: "", externalReference: "" },
  }],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/admin/activity-tracking?**", async (route) => {
    if (route.request().url().includes("format=csv")) {
      await route.fulfill({ status: 200, contentType: "text/csv", body: "Account,Active minutes\nalex@bickers.co.uk,35" });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(report) });
  });
  await page.route("**/api/admin/activity-tracking", async (route) => {
    if (route.request().method() === "PATCH") {
      const payload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, review: { ...payload, reviewerEmail: "admin@bickers.co.uk" } }) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/admin/activity-tracking/settings", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, settings: report.settings }) });
  });
  await page.goto("/activity-tracking-e2e");
});

test("admin activity report filters and expands out-of-hours evidence", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "User Activity" })).toBeVisible();
  await expect(page.getByText("35 min · Flagged")).toBeVisible();
  await page.getByRole("button", { name: "Show session detail" }).click();
  await expect(page.getByText("Known job activity")).toBeVisible();
  await page.getByLabel("Classification").selectOption("possible_overtime");
  await page.getByLabel("Admin note").fill("Reviewed against call log");
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByLabel("Classification")).toHaveValue("possible_overtime");
});

test("tracking settings expose fallback hours without timesheet controls", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Company fallback schedule")).toBeVisible();
  await expect(page.getByLabel("Monday start")).toHaveValue("08:00");
  await expect(page.getByText(/does not create overtime or change timesheets/i)).toBeVisible();
});
