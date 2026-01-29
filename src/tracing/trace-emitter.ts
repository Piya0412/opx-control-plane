/**
 * Phase 8.1: Trace Event Emitter
 * 
 * Emits LLM trace events to EventBridge.
 * 
 * GOVERNANCE RULES (LOCKED):
 * - Tracing failures NEVER fail agents
 * - Async, non-blocking
 * - Best-effort delivery
 * - No exceptions propagated
 */

import { EventBridge } from '@aws-sdk/client-eventbridge';
import { TraceEvent } from './trace.schema';

const eventBridge = new EventBridge({});
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME || 'opx-control-plane';

export async function emitTraceEvent(trace: TraceEvent): Promise<void> {
  try {
    await eventBridge.putEvents({
      Entries: [
        {
          Source: 'opx.langgraph',
          DetailType: 'LLMTraceEvent',
          Detail: JSON.stringify(trace),
          EventBusName: EVENT_BUS_NAME,
        },
      ],
    });
  } catch (error) {
    // CRITICAL: Tracing failures are logged but NOT propagated
    console.warn('Failed to emit trace event', {
      traceId: trace.traceId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Do NOT throw - tracing failures must not break agents
  }
}
