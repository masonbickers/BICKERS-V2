const MAX_MESSAGE_LENGTH = 600;

const SECRET_PATTERNS = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]"],
  [/\b(?:token|secret|password|authorization|cookie|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, "$&"],
];

function redactSensitiveText(value) {
  let output = String(value || "");
  output = output.replace(SECRET_PATTERNS[0][0], SECRET_PATTERNS[0][1]);
  output = output.replace(
    SECRET_PATTERNS[1][0],
    (match) => `${match.slice(0, match.search(/[=:]/) + 1)}[REDACTED]`,
  );
  return output.slice(0, MAX_MESSAGE_LENGTH);
}
function pathnameOnly(value) {
  const rawPath = String(value || "/");
  try {
    return new URL(rawPath, "https://monitoring.invalid").pathname;
  } catch {
    return rawPath.split(/[?#]/, 1)[0] || "/";
  }
}

export function createServerErrorEvent(error, request = {}, context = {}, environment = process.env) {
  return {
    event: "production_server_error",
    occurredAt: new Date().toISOString(),
    error: {
      name: redactSensitiveText(error?.name || "Error"),
      message: redactSensitiveText(error?.message || "Unhandled server error"),
      digest: error?.digest ? redactSensitiveText(error.digest) : null,
    },
    request: {
      method: String(request.method || "UNKNOWN").toUpperCase().slice(0, 12),
      path: pathnameOnly(request.path),
    },
    route: {
      path: pathnameOnly(context.routePath || "unknown"),
      type: context.routeType || "unknown",
      router: context.routerKind || "unknown",
      renderSource: context.renderSource || null,
      revalidateReason: context.revalidateReason || null,
    },
    deployment: {
      environment: environment.VERCEL_ENV || environment.NODE_ENV || "unknown",
      commitSha: environment.VERCEL_GIT_COMMIT_SHA || null,
      region: environment.VERCEL_REGION || null,
    },
  };
}
