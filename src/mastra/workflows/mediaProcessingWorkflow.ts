import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

export const mediaProcessingWorkflow = createWorkflow({
  id: 'media-processing',
  description: 'Comprehensive media processing workflow for video and audio files',
  inputSchema: z.object({
    inputFile: z.string().describe('Input media file to process'),
    operations: z.array(z.object({
      type: z.enum(['trim', 'resize', 'convert', 'analyze', 'speed', 'thumbnail']).describe('Type of operation'),
      parameters: z.record(z.any()).describe('Operation-specific parameters')
    })).describe('Array of operations to perform'),
    outputFormat: z.string().optional().describe('Output format for conversion operations')
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    results: z.array(z.any()).optional()
  }),
  steps: []
}); 