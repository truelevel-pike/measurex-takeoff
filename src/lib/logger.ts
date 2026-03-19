const isDev = process.env.NODE_ENV === "development";

function noop(..._args: unknown[]): void {}

export const logger = {
  debug: isDev ? (...args: unknown[]) => console.debug("[MX:DEBUG]", ...args) : noop,
  info: isDev ? (...args: unknown[]) => console.info("[MX:INFO]", ...args) : noop,
  warn: (...args: unknown[]) => console.warn("[MX:WARN]", ...args),
  error: (...args: unknown[]) => console.error("[MX:ERROR]", ...args),
};

export default logger;
