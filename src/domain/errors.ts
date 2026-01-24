/**
 * Base error for opx-control-plane
 * 
 * 🔒 PHASE 1 CONSTRAINT: Errors must be deterministic and non-suggestive.
 */
export class OpxError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public requestId?: string;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OpxError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        requestId: this.requestId,
        details: this.details,
      },
    };
  }
}

/**
 * Invalid state transition attempted
 */
export class InvalidTransitionError extends OpxError {
  constructor(
    currentState: string,
    targetState: string,
    allowedTransitions: string[]
  ) {
    super(
      `Invalid transition from ${currentState} to ${targetState}`,
      'INVALID_TRANSITION',
      400,
      {
        currentState,
        targetState,
        allowedTransitions,
      }
    );
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Incident not found
 */
export class IncidentNotFoundError extends OpxError {
  constructor(incidentId: string) {
    super(
      `Incident not found: ${incidentId}`,
      'INCIDENT_NOT_FOUND',
      404,
      { incidentId }
    );
    this.name = 'IncidentNotFoundError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends OpxError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Optimistic locking conflict
 */
export class ConflictError extends OpxError {
  constructor(incidentId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Conflict: incident ${incidentId} has been modified`,
      'CONFLICT',
      409,
      { incidentId, expectedVersion, actualVersion }
    );
    this.name = 'ConflictError';
  }
}

/**
 * Approval required but not provided
 */
export class ApprovalRequiredError extends OpxError {
  constructor(incidentId: string, action: string) {
    super(
      `Approval required for action: ${action}`,
      'APPROVAL_REQUIRED',
      403,
      { incidentId, action }
    );
    this.name = 'ApprovalRequiredError';
  }
}

/**
 * Idempotency conflict error
 * 
 * 🔒 PHASE 1 CONSTRAINT: State the problem, not the solution.
 */
export class IdempotencyConflictError extends OpxError {
  constructor(
    idempotencyKey: string,
    existingIncidentId: string,
    details?: Record<string, unknown>
  ) {
    super(
      `Idempotency key reused with different request`,
      'IDEMPOTENCY_CONFLICT',
      409,
      {
        idempotencyKey,
        existingIncidentId,
        ...details,
      }
    );
    this.name = 'IdempotencyConflictError';
  }
}
