import { isDvsaResultForCompletion } from "./maintenanceMutationPolicy.js";

export const isDvsaCronAuthorized = (authorizationHeader, cronSecret) =>
  Boolean(cronSecret) && authorizationHeader === `Bearer ${cronSecret}`;

export const isRetryableDvsaStatus = (status) =>
  !status || status === 408 || status === 429 || status >= 500;

export const withBoundedRetry = async (
  operation,
  { maxAttempts = 3, delay = (attempt) => 250 * (2 ** (attempt - 1)), wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}
) => {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableDvsaStatus(Number(error?.response?.status || 0))) throw error;
      await wait(delay(attempt));
    }
  }
  throw lastError;
};

const dateOnly = (value) => String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";

export const buildMotConfirmationFields = (vehicle, motHistory, confirmedAt = new Date().toISOString()) => {
  const awaitingCompletionDate = dateOnly(vehicle?.motAwaitingDvsaCompletionDate);
  const latestPassedDate = dateOnly(motHistory?.latestPassedMot?.completedDate);
  const confirmsNewMot = !awaitingCompletionDate || isDvsaResultForCompletion(latestPassedDate, awaitingCompletionDate);
  const patch = {};

  if (confirmsNewMot && motHistory?.lastMOT) {
    patch.lastMOT = dateOnly(motHistory.lastMOT);
    patch.lastMot = patch.lastMOT;
    patch.lastMotDate = patch.lastMOT;
  }
  if (confirmsNewMot && motHistory?.nextMOT) {
    patch.nextMOT = dateOnly(motHistory.nextMOT);
    patch.nextMot = patch.nextMOT;
    patch.nextMotDate = patch.nextMOT;
    patch.motDueDate = patch.nextMOT;
    patch.motExpiryDate = patch.nextMOT;
  }
  if (awaitingCompletionDate) {
    if (confirmsNewMot && patch.nextMOT) {
      patch.motAwaitingDvsaConfirmation = false;
      patch.motAwaitingDvsaCompletionDate = "";
      patch.motAwaitingDvsaBookingId = "";
      patch.motDvsaConfirmationStatus = "confirmed";
      patch.motDvsaConfirmedAt = confirmedAt;
    } else {
      patch.motAwaitingDvsaConfirmation = true;
      patch.motDvsaConfirmationStatus = "awaiting";
    }
  }
  return { confirmsNewMot, patch };
};

export const runMotSyncBatch = async ({
  vehicles,
  getAccessToken,
  shouldSync,
  registrationFor,
  fetchHistory,
  buildPatch,
  updateVehicle,
  now = () => Date.now(),
}) => {
  const startedAtMs = now();
  const token = await getAccessToken();
  const results = {
    checked: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    unchanged: 0,
    failures: [],
    updatedVehicles: [],
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: "",
    durationMs: 0,
  };

  for (const vehicle of vehicles) {
    const vrm = registrationFor(vehicle);
    if (!shouldSync(vehicle)) {
      results.skipped += 1;
      continue;
    }
    results.checked += 1;
    try {
      const history = await fetchHistory(vrm, token);
      const patch = buildPatch(vehicle, history);
      if (!Object.keys(patch).length) {
        results.unchanged += 1;
        continue;
      }
      await updateVehicle(vehicle, patch);
      results.updated += 1;
      results.updatedVehicles.push({ vehicleId: vehicle.id, vrm, changedFields: Object.keys(patch) });
    } catch (error) {
      results.failed += 1;
      results.failures.push({
        vehicleId: vehicle.id,
        vrm,
        status: error?.response?.status || null,
        message: error?.response?.data?.message || error?.message || "Unknown DVSA failure",
      });
    }
  }
  const finishedAtMs = now();
  results.finishedAt = new Date(finishedAtMs).toISOString();
  results.durationMs = Math.max(0, finishedAtMs - startedAtMs);
  return results;
};
