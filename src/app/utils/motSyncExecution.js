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
  maxConcurrency = 1,
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

  const syncableVehicles = [];
  for (const vehicle of vehicles) {
    const vrm = registrationFor(vehicle);
    if (!shouldSync(vehicle)) {
      results.skipped += 1;
      continue;
    }
    results.checked += 1;
    syncableVehicles.push({ vehicle, vrm });
  }

  const outcomes = new Array(syncableVehicles.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < syncableVehicles.length) {
      const index = nextIndex;
      nextIndex += 1;
      const { vehicle, vrm } = syncableVehicles[index];

      try {
        const history = await fetchHistory(vrm, token);
        const patch = buildPatch(vehicle, history);
        if (!Object.keys(patch).length) {
          outcomes[index] = { status: "unchanged" };
          continue;
        }
        await updateVehicle(vehicle, patch);
        outcomes[index] = {
          status: "updated",
          updatedVehicle: { vehicleId: vehicle.id, vrm, changedFields: Object.keys(patch) },
        };
      } catch (error) {
        outcomes[index] = {
          status: "failed",
          failure: {
            vehicleId: vehicle.id,
            vrm,
            status: error?.response?.status || null,
            message: error?.response?.data?.message || error?.message || "Unknown DVSA failure",
          },
        };
      }
    }
  };

  const concurrency = Math.max(1, Math.min(
    Number.isFinite(Number(maxConcurrency)) ? Math.floor(Number(maxConcurrency)) : 1,
    syncableVehicles.length || 1
  ));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  for (const outcome of outcomes) {
    if (outcome?.status === "updated") {
      results.updated += 1;
      results.updatedVehicles.push(outcome.updatedVehicle);
    } else if (outcome?.status === "unchanged") {
      results.unchanged += 1;
    } else if (outcome?.status === "failed") {
      results.failed += 1;
      results.failures.push(outcome.failure);
    }
  }
  const finishedAtMs = now();
  results.finishedAt = new Date(finishedAtMs).toISOString();
  results.durationMs = Math.max(0, finishedAtMs - startedAtMs);
  return results;
};
