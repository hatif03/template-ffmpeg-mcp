import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

export const batchProcessingWorkflow = createWorkflow({
  id: 'batch-processing',
  description: 'Batch processing workflow for multiple media files',
  inputSchema: z.object({
    files: z.array(z.string()).describe('Array of input files to process'),
    operation: z.enum(['convert', 'resize', 'trim', 'analyze']).describe('Operation to perform on all files'),
    parameters: z.record(z.any()).describe('Parameters for the operation'),
    outputFormat: z.string().optional().describe('Output format for conversion operations')
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    results: z.array(z.any()).optional()
  }),
  steps: []
}); 