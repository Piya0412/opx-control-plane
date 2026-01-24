/**
 * Structured Logging Utility
 * 
 * 🔒 PHASE 1 CONSTRAINT: Logging must not mutate behavior.
 * 
 * ALLOWED:
 * - Emit structured JSON logs
 * - Include request context
 * - CloudWatch Insights queries
 * 
 * FORBIDDEN:
 * - Logs triggering alarms that mutate state
 * - Logs interpreted as control signals
 * - Logs fed into control decisions
 * - Dynamic log schemas
 * 
 * RULE: Logging is observational only.
 */

export interface LogContext {
  requestId: string;
  correlationId: string;
  principal?: string;
}

interface BaseLogEntry {
  level: string;
  timestamp: string;
  requestId: string;
  correlationId: string;
  principal?: string;
  message: string;
}

interface InfoLogEntry extends BaseLogEntry {
  level: 'INFO';
  operation?: string;
  [key: string]: any;
}

interface ErrorLogEntry extends BaseLogEntry {
  level: 'ERROR';
  error: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  [key: string]: any;
}

interface WarningLogEntry extends BaseLogEntry {
  level: 'WARNING';
  [key: string]: any;
}

/**
 * Log informational message
 * 
 * Observational only - does not affect control flow.
 */
export function logInfo(
  message: string,
  context: LogContext,
  data?: Record<string, unknown>
): void {
  const entry: InfoLogEntry = {
    level: 'INFO',
    timestamp: new Date().toISOString(),
    requestId: context.requestId,
    correlationId: context.correlationId,
    principal: context.principal,
    message,
    ...data,
  };

  console.log(JSON.stringify(entry));
}

/**
 * Log error message
 * 
 * Observational only - does not affect control flow.
 */
export function logError(
  message: string,
  context: LogContext,
  error: Error,
  data?: Record<string, unknown>
): void {
  const entry: ErrorLogEntry = {
    level: 'ERROR',
    timestamp: new Date().toISOString(),
    requestId: context.requestId,
    correlationId: context.correlationId,
    principal: context.principal,
    message,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    },
    ...data,
  };

  console.error(JSON.stringify(entry));
}

/**
 * Log warning message
 * 
 * Observational only - does not affect control flow.
 */
export function logWarning(
  message: string,
  context: LogContext,
  data?: Record<string, unknown>
): void {
  const entry: WarningLogEntry = {
    level: 'WARNING',
    timestamp: new Date().toISOString(),
    requestId: context.requestId,
    correlationId: context.correlationId,
    principal: context.principal,
    message,
    ...data,
  };

  console.warn(JSON.stringify(entry));
}
