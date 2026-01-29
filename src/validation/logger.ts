/**
 * Simple logger for validation modules
 * Wraps console logging with structured output
 */
export class Logger {
  constructor(private component: string) {}

  info(message: string, data?: Record<string, unknown>): void {
    console.log(JSON.stringify({
      level: 'INFO',
      timestamp: new Date().toISOString(),
      component: this.component,
      message,
      ...data,
    }));
  }

  warn(message: string, data?: Record<string, unknown>): void {
    console.warn(JSON.stringify({
      level: 'WARN',
      timestamp: new Date().toISOString(),
      component: this.component,
      message,
      ...data,
    }));
  }

  error(message: string, data?: Record<string, unknown>): void {
    console.error(JSON.stringify({
      level: 'ERROR',
      timestamp: new Date().toISOString(),
      component: this.component,
      message,
      ...data,
    }));
  }

  debug(message: string, data?: Record<string, unknown>): void {
    console.debug(JSON.stringify({
      level: 'DEBUG',
      timestamp: new Date().toISOString(),
      component: this.component,
      message,
      ...data,
    }));
  }
}
