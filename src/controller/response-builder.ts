/**
 * CP-8: Response Builder
 * 
 * Builds HTTP responses with proper formatting and error translation.
 * 
 * 🔒 CORRECTION 3: Translates CP-7 errors to HTTP-safe responses
 */

export interface ControllerResponse<T> {
  statusCode: number;
  body: string; // JSON stringified
  headers: Record<string, string>;
}

export interface ErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ResponseMetadata {
  requestId: string;
  timestamp: string;
  version: string;
}

interface ResponseBody<T> {
  data?: T;
  error?: ErrorDetail;
  metadata: ResponseMetadata;
}

// CP-7 error to HTTP mapping (FROZEN)
const CP7_ERROR_MAPPING: Record<string, { status: number; code: string; message: string }> = {
  INCIDENT_NOT_FOUND: {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Incident not found',
  },
  ILLEGAL_TRANSITION: {
    status: 409,
    code: 'ILLEGAL_TRANSITION',
    message: 'State transition not allowed',
  },
  THROTTLED_TRANSITION: {
    status: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Incident mutation throttled',
  },
  RESOLUTION_REQUIRED: {
    status: 400,
    code: 'MISSING_RESOLUTION',
    message: 'Resolution metadata required',
  },
  RESOLUTION_IMMUTABLE: {
    status: 409,
    code: 'RESOLUTION_IMMUTABLE',
    message: 'Resolution already set',
  },
  AUTHORITY_REJECTED: {
    status: 403,
    code: 'UNAUTHORIZED',
    message: 'Authority insufficient',
  },
  STORE_FAILURE: {
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    message: 'Service temporarily unavailable',
  },
};

export class ResponseBuilder {
  private readonly version = 'v1';

  /**
   * Build success response
   */
  success<T>(data: T, requestId: string): ControllerResponse<T> {
    const body: ResponseBody<T> = {
      data,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        version: this.version,
      },
    };

    return {
      statusCode: 200,
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  /**
   * Build error response
   */
  error(
    statusCode: number,
    code: string,
    message: string,
    requestId: string,
    details?: Record<string, unknown>
  ): ControllerResponse<never> {
    const body: ResponseBody<never> = {
      error: {
        code,
        message,
        details,
      },
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        version: this.version,
      },
    };

    return {
      statusCode,
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  /**
   * Build rate limit response
   */
  rateLimitExceeded(
    retryAfter: number,
    requestId: string
  ): ControllerResponse<never> {
    const body: ResponseBody<never> = {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded',
        details: { retryAfter },
      },
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        version: this.version,
      },
    };

    return {
      statusCode: 429,
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    };
  }

  /**
   * Translate CP-7 error to HTTP-safe response
   * 
   * 🔒 CORRECTION 3: Never return raw CP-7 errors
   */
  translateCP7Error(
    cp7Error: Error,
    requestId: string
  ): ControllerResponse<never> {
    // Log raw error internally (not exposed to client)
    console.error('CP-7 error:', {
      requestId,
      error: cp7Error.message,
      stack: cp7Error.stack,
    });

    const errorMessage = cp7Error.message.toLowerCase();

    // Check for specific error patterns (order matters - most specific first)
    
    // Resolution errors
    if (errorMessage.includes('resolution')) {
      if (errorMessage.includes('already') || errorMessage.includes('immutable')) {
        return this.error(409, 'RESOLUTION_IMMUTABLE', 'Resolution already set', requestId);
      }
      if (errorMessage.includes('required') || errorMessage.includes('requires resolution')) {
        return this.error(400, 'MISSING_RESOLUTION', 'Resolution metadata required', requestId);
      }
    }

    // Not found errors
    if (errorMessage.includes('not found')) {
      return this.error(404, 'NOT_FOUND', 'Incident not found', requestId);
    }

    // Transition errors
    if (errorMessage.includes('illegal transition') || errorMessage.includes('illegal')) {
      return this.error(409, 'ILLEGAL_TRANSITION', 'State transition not allowed', requestId);
    }

    if (errorMessage.includes('terminal')) {
      return this.error(409, 'ILLEGAL_TRANSITION', 'Cannot transition from terminal state', requestId);
    }

    // Throttling errors
    if (errorMessage.includes('throttled') || errorMessage.includes('throttle')) {
      return this.error(429, 'RATE_LIMIT_EXCEEDED', 'Incident mutation throttled', requestId);
    }

    // Authority errors
    if (errorMessage.includes('authority') || errorMessage.includes('unauthorized')) {
      return this.error(403, 'UNAUTHORIZED', 'Authority insufficient', requestId);
    }

    // Storage errors
    if (errorMessage.includes('store') || errorMessage.includes('dynamodb')) {
      return this.error(503, 'SERVICE_UNAVAILABLE', 'Service temporarily unavailable', requestId);
    }

    // Check against mapping table for exact matches
    for (const [pattern, mapping] of Object.entries(CP7_ERROR_MAPPING)) {
      if (cp7Error.message.includes(pattern) || errorMessage.includes(pattern.toLowerCase())) {
        return this.error(
          mapping.status,
          mapping.code,
          mapping.message,
          requestId
        );
      }
    }

    // Default to internal error for unknown errors
    return this.error(
      500,
      'INTERNAL_ERROR',
      'Internal server error',
      requestId
    );
  }
}
