import { createServerErrorEvent } from "./app/utils/productionMonitoring";

export function register() {}

export function onRequestError(error, request, context) {
  const event = createServerErrorEvent(error, request, context);

  // Vercel indexes console output in Runtime Logs. Keep this payload structured
  // and free of headers, query strings, user IDs, and request bodies.
  console.error(JSON.stringify(event));
}
