/**
 * CP-3: Field Accessor
 * 
 * Safe field access for rule evaluation.
 * Returns undefined (not null) for missing paths.
 * 
 * Supports:
 * - Simple: "severity"
 * - Nested: "resourceRefs[0].refValue"
 * - Deep: "metadata.tags.environment"
 */

/**
 * Get a value from an object using dot notation path
 * 
 * @param obj - Object to access
 * @param path - Dot notation path (e.g., "resourceRefs[0].refValue")
 * @returns Value at path or undefined if not found
 */
export function getFieldValue(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  
  if (typeof obj !== 'object') {
    return undefined;
  }
  
  // Parse path into segments
  const segments = parsePath(path);
  
  let current: unknown = obj;
  
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    
    if (typeof current !== 'object') {
      return undefined;
    }
    
    if (segment.type === 'property') {
      current = (current as Record<string, unknown>)[segment.key];
    } else if (segment.type === 'index') {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment.index];
    }
  }
  
  return current;
}

interface PropertySegment {
  type: 'property';
  key: string;
}

interface IndexSegment {
  type: 'index';
  index: number;
}

type PathSegment = PropertySegment | IndexSegment;

/**
 * Parse a path string into segments
 * 
 * Examples:
 * - "severity" → [{ type: 'property', key: 'severity' }]
 * - "resourceRefs[0]" → [{ type: 'property', key: 'resourceRefs' }, { type: 'index', index: 0 }]
 * - "resourceRefs[0].refValue" → [{ type: 'property', key: 'resourceRefs' }, { type: 'index', index: 0 }, { type: 'property', key: 'refValue' }]
 */
function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  
  // Split by dots, but handle array notation
  const parts = path.split('.');
  
  for (const part of parts) {
    // Check for array notation: "resourceRefs[0]"
    const arrayMatch = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[(\d+)\]$/);
    
    if (arrayMatch) {
      // Property followed by index
      segments.push({ type: 'property', key: arrayMatch[1] });
      segments.push({ type: 'index', index: parseInt(arrayMatch[2], 10) });
    } else if (/^\d+$/.test(part)) {
      // Pure numeric index (rare, but support it)
      segments.push({ type: 'index', index: parseInt(part, 10) });
    } else {
      // Simple property
      segments.push({ type: 'property', key: part });
    }
  }
  
  return segments;
}

/**
 * Check if a field exists (is not undefined)
 */
export function fieldExists(obj: unknown, path: string): boolean {
  return getFieldValue(obj, path) !== undefined;
}
