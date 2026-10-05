export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class InsufficientStockError extends ConflictError {
  public readonly variantId?: string;
  public readonly available?: string;
  public readonly requested?: string;

  constructor(message: string = 'Insufficient stock available', details?: { variantId?: string; available?: string; requested?: string }) {
    super(message);
    this.variantId = details?.variantId;
    this.available = details?.available;
    this.requested = details?.requested;
  }
}
