export const API_INPUT_LIMITS = Object.freeze({
  aiBodyBytes: 256 * 1024,
  aiTextChars: 4_000,
  aiHistoryMessages: 8,
  aiClientContextBytes: 128 * 1024,
  aiCompactContextBytes: 32 * 1024,
});

const text = (value) => String(value || "").trim();
const bytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");

export function normalizeVrm(value) {
  const vrm = String(value || "").replace(/\s+/g, "").toUpperCase();
  return /^[A-Z0-9]{2,8}$/.test(vrm) ? vrm : "";
}

export function validateAiRequestPayload(body = {}) {
  const prompt = text(body.prompt);
  if (!prompt) return { ok: false, status: 400, error: "Missing prompt." };
  if (prompt.length > API_INPUT_LIMITS.aiTextChars) {
    return { ok: false, status: 413, error: "Prompt exceeds 4,000 characters." };
  }
  if (!body.clientContext || typeof body.clientContext !== "object" || Array.isArray(body.clientContext)) {
    return { ok: false, status: 400, error: "Assistant context is required." };
  }
  if (bytes(body.clientContext) > API_INPUT_LIMITS.aiClientContextBytes) {
    return { ok: false, status: 413, error: "Client context exceeds 128 KB." };
  }
  if (body.messages != null && !Array.isArray(body.messages)) {
    return { ok: false, status: 400, error: "Messages must be an array." };
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length > API_INPUT_LIMITS.aiHistoryMessages) {
    return { ok: false, status: 413, error: "Message history is limited to eight messages." };
  }
  if (messages.some((item) =>
    !item || !["user", "assistant"].includes(item.role) || text(item.content).length > API_INPUT_LIMITS.aiTextChars
  )) {
    return { ok: false, status: 413, error: "Each message requires a valid role and at most 4,000 characters." };
  }
  return {
    ok: true,
    value: {
      prompt,
      messages: messages.map((item) => ({ role: item.role, content: text(item.content) })),
      clientContext: body.clientContext,
    },
  };
}
