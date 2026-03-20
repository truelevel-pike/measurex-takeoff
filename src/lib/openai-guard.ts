/**
 * Centralized OpenAI API key guard.
 * Returns a 503 JSON Response if the key is missing, or null if the key is present.
 *
 * SECURITY: Use OPENAI_API_KEY (server-only). Never use NEXT_PUBLIC_OPENAI_API_KEY —
 * the NEXT_PUBLIC_ prefix exposes the value to the browser bundle.
 */
export function checkOpenAIKey(): Response | null {
  const key = process.env.OPENAI_API_KEY;
  if (key) return null;

  return Response.json(
    {
      error: 'OpenAI API key not configured',
      detail:
        'Set OPENAI_API_KEY in your environment or .env.local to enable AI features.',
    },
    { status: 503 },
  );
}

/**
 * Returns the OpenAI API key, or null if not configured.
 */
export function getOpenAIKey(): string | null {
  return process.env.OPENAI_API_KEY || null;
}
