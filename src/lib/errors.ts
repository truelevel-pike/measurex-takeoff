/**
 * Custom error class for resources that are not found.
 * Use this instead of matching error message strings to determine HTTP status.
 */
export class NotFoundError extends Error {
  readonly notFound = true;

  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
