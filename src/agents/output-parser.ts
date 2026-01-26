/**
 * Phase 6 Step 2: Output Parser
 * 
 * Fail-closed parsing of LLM outputs with Zod validation.
 * 
 * CORRECTION 6: Zod schemas with fail-closed parsing
 */

import { z } from 'zod';

export class OutputParser {
  /**
   * Parse LLM output with fail-closed logic
   * 
   * @param llmOutput - Raw LLM output string
   * @param schema - Zod schema to validate against
   * @returns Parsed and validated output, or safe fallback
   */
  parse(llmOutput: string, schema: z.ZodSchema): any {
    try {
      // Attempt to extract JSON from LLM output
      const jsonMatch = llmOutput.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No JSON found in LLM output');
        return this.fallbackOutput();
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate with Zod
      const validated = schema.parse(parsed);
      
      return validated;
      
    } catch (error) {
      console.error('Failed to parse LLM output', error);
      return this.fallbackOutput();
    }
  }
  
  /**
   * Fail-closed: return safe default when parsing fails
   */
  private fallbackOutput(): any {
    return {
      hypothesis: {
        type: 'ROOT_CAUSE',
        description: 'Unable to analyze - LLM output invalid',
        confidence: {
          confidence_estimate: 0.0,
          confidence_basis: ['assumption'],
          confidence_breakdown: {
            data_quality: 0.0,
            pattern_strength: 0.0,
            assumption_count: 1,
          },
        },
        supporting_evidence: [],
        contradicting_evidence: [],
      },
      recommendations: [],
    };
  }
}
