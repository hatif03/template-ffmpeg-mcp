import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { spawn, exec } from 'child_process';
import { writeFile, readFile, access, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

// FFmpeg Utilities
class FFmpegUtils {
  private static uploadDir = './uploads';
  private static captureProcess: any = null;
  private static captureOutputFile: string | null = null;

  static async ensureUploadDir(): Promise<void> {
    if (!existsSync(this.uploadDir)) {
      await mkdir(this.uploadDir, { recursive: true });
    }
  }

  static sanitizeFilename(filename: string): string {
    const sanitized = filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .toLowerCase()
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');
    
    return sanitized || 'uploaded_file';
  }

  static async saveFile(filename: string, content: string): Promise<string> {
    await this.ensureUploadDir();
    const sanitizedName = this.sanitizeFilename(filename);
    const filePath = join(this.uploadDir, sanitizedName);
    
    const buffer = Buffer.from(content, 'base64');
    await writeFile(filePath, buffer);
    
    return sanitizedName;
  }

  static async fileExists(filename: string): Promise<boolean> {
    try {
      await access(join(this.uploadDir, filename));
      return true;
    } catch {
      return false;
    }
  }

  static async executeCommand(command: string, workingDir?: string): Promise<{
    success: boolean;
    output: string;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const cwd = workingDir || this.uploadDir;
      const proc = exec(command, { cwd }, (error, stdout, stderr) => {
        const output = stdout + stderr;
        if (error) {
          resolve({
            success: false,
            output,
            error: error.message
          });
        } else {
          resolve({
            success: true,
            output
          });
        }
      });

      setTimeout(() => {
        proc.kill();
        resolve({
          success: false,
          output: '',
          error: 'Command timed out'
        });
      }, 600000);
    });
  }

  static async executeFFmpegCommand(args: string[], workingDir?: string): Promise<{
    success: boolean;
    output: string;
    error?: string;
  }> {
    const cwd = workingDir || this.uploadDir;
    return new Promise((resolve) => {
      const proc = spawn('ffmpeg', args, { 
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const output = stdout + stderr;
        if (code === 0) {
          resolve({
            success: true,
            output
          });
        } else {
          resolve({
            success: false,
            output,
            error: `Process exited with code ${code}`
          });
        }
      });

      proc.on('error', (error) => {
        resolve({
          success: false,
          output: '',
          error: error.message
        });
      });

      setTimeout(() => {
        proc.kill();
        resolve({
          success: false,
          output: '',
          error: 'Command timed out'
        });
      }, 600000);
    });
  }

  static async executeFFprobeCommand(args: string[]): Promise<{
    success: boolean;
    output: string;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const proc = spawn('ffprobe', args, { 
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const output = stdout + stderr;
        if (code === 0) {
          resolve({
            success: true,
            output
          });
        } else {
          resolve({
            success: false,
            output,
            error: `Process exited with code ${code}`
          });
        }
      });

      proc.on('error', (error) => {
        resolve({
          success: false,
          output: '',
          error: error.message
        });
      });

      setTimeout(() => {
        proc.kill();
        resolve({
          success: false,
          output: '',
          error: 'Command timed out'
        });
      }, 600000);
    });
  }

  static startCapture(command: string, outputFile: string): void {
    if (this.captureProcess) {
      this.captureProcess.kill();
    }
    
    this.captureOutputFile = outputFile;
    this.captureProcess = exec(command);
  }

  static stopCapture(): { status: string; filename?: string } {
    if (this.captureProcess) {
      this.captureProcess.kill();
      this.captureProcess = null;
      const filename = this.captureOutputFile;
      this.captureOutputFile = null;
      return { status: 'stopped', filename: filename || undefined };
    }
    return { status: 'not_running' };
  }

  static parseFFprobeOutput(output: string): any {
    try {
      const lines = output.split('\n');
      const result: any = { format: {}, streams: [] };
      let currentStream: any = {};
      let inStream = false;

      for (const line of lines) {
        if (line.startsWith('[FORMAT]')) {
          inStream = false;
        } else if (line.startsWith('[STREAM]')) {
          if (Object.keys(currentStream).length > 0) {
            result.streams.push(currentStream);
          }
          currentStream = {};
          inStream = true;
        } else if (line.includes('=')) {
          const [key, value] = line.split('=', 2);
          if (inStream) {
            currentStream[key.trim()] = value.trim();
          } else {
            result.format[key.trim()] = value.trim();
          }
        }
      }

      if (Object.keys(currentStream).length > 0) {
        result.streams.push(currentStream);
      }

      return result;
    } catch (error) {
      return { error: 'Failed to parse ffprobe output' };
    }
  }
}

// File Upload Tool
export const uploadFileTool = createTool({
  id: 'upload-file',
  description: 'Upload a file to the FFmpeg processing environment',
  inputSchema: z.object({
    filename: z.string().describe('Name of the file to upload'),
    content: z.string().describe('Base64 encoded file content'),
    mimeType: z.string().optional().describe('MIME type of the file')
  }),
  execute: async ({ context }) => {
    const { filename, content, mimeType } = context;
    
    try {
      const savedFilename = await FFmpegUtils.saveFile(filename, content);
      return {
        success: true,
        message: `File ${filename} uploaded successfully as ${savedFilename}`,
        filename: savedFilename
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to upload file',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
});

// Execute FFmpeg Command Tool
export const executeFFmpegCommandTool = createTool({
  id: 'execute-ffmpeg-command',
  description: 'Execute a custom FFmpeg command',
  inputSchema: z.object({
    command: z.string().describe('The FFmpeg command to execute'),
    inputFile: z.string().optional().describe('Input file path'),
    outputFile: z.string().optional().describe('Output file path'),
    workingDirectory: z.string().optional().describe('Working directory for the command')
  }),
  execute: async ({ context }) => {
    const { command, inputFile, outputFile, workingDirectory } = context;
    
    try {
      if (!command.trim().startsWith('ffmpeg') && !command.trim().startsWith('ffprobe')) {
        return {
          success: false,
          message: 'Only ffmpeg and ffprobe commands are allowed',
          error: 'Invalid command'
        };
      }

      const modifiedCommand = command.replace(/^ffmpeg\s/, 'ffmpeg -y ');
      const result = await FFmpegUtils.executeCommand(modifiedCommand, workingDirectory);
      
      return {
        success: result.success,
        message: result.success ? 'Command executed successfully' : 'Command failed',
        output: result.output,
        outputFile: outputFile,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to execute command',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
});

// Trim Video Tool
export const trimVideoTool = createTool({
  id: 'trim-video',
  description: 'Trim a video file to a specific time range',
  inputSchema: z.object({
    inputFilename: z.string().describe('Input video filename'),
    start: z.string().describe('Start time (HH:MM:SS format)'),
    end: z.string().describe('End time (HH:MM:SS format)')
  }),
  execute: async ({ context }) => {
    const { inputFilename, start, end } = context;
    
    try {
      const outputFilename = `trimmed_${inputFilename}`;
      const args = [
        '-i', inputFilename,
        '-ss', start,
        '-to', end,
        '-c', 'copy',
        outputFilename
      ];

      const result = await FFmpegUtils.executeFFmpegCommand(args);
      
      return {
        success: result.success,
        message: result.success ? 'Video trimmed successfully' : 'Failed to trim video',
        output: result.output,
        outputFile: result.success ? outputFilename : undefined,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to trim video',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
});

// Change Frame Rate Tool
export const changeFrameRateTool = createTool({
  id: 'change-frame-rate',
  description: 'Change the frame rate of a video file',
  inputSchema: z.object({
    inputFilename: z.string().describe('Input video filename'),
    frameRate: z.string().describe('Target frame rate (e.g., 30, 60, 24)')
  }),
  execute: async ({ context }) => {
    const { inputFilename, frameRate } = context;
    
    try {
      const outputFilename = `fps_${frameRate}_${inputFilename}`;
      const args = [
        '-i', inputFilename,
        '-r', frameRate,
        '-c:v', 'libx264',
        '-preset', 'medium',
        outputFilename
      ];

      const result = await FFmpegUtils.executeFFmpegCommand(args);
      
      return {
        success: result.success,
        message: result.success ? 'Frame rate changed successfully' : 'Failed to change frame rate',
        output: result.output,
        outputFile: result.success ? outputFilename : undefined,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to change frame rate',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
});

// Convert to GIF/WebP Tool
export const convertToGifWebpTool = createTool({
  id: 'convert-to-gif-webp',
  description: 'Convert video to GIF or WebP format',
  inputSchema: z.object({
    inputFilename: z.string().describe('Input video filename'),
    startTime: z.string().describe('Start time (HH:MM:SS format)'),
    duration: z.string().describe('Duration (HH:MM:SS format)'),
    format: z.enum(['gif', 'webp']).describe('Output format'),
    scaleHeight: z.number().describe('Scale height for output'),
    fps: z.number().describe('Frames per second for output')
  }),
  execute: async ({ context }) => {
    const { inputFilename, startTime, duration, format, scaleHeight, fps } = context;
    
    try {
      const outputFilename = `converted_${inputFilename}.${format}`;
      let args: string[];

      if (format === 'gif') {
        const paletteFile = 'palette.png';
        const paletteArgs = [
          '-i', inputFilename,
          '-ss', startTime,
          '-t', duration,
          '-vf', `fps=${fps},scale=-1:${scaleHeight}:flags=lanczos,palettegen`,
          '-y', paletteFile
        ];

        const paletteResult = await FFmpegUtils.executeFFmpegCommand(paletteArgs);
        if (!paletteResult.success) {
          return {
            success: false,
            message: 'Failed to generate palette',
            error: paletteResult.error
          };
        }

        args = [
          '-i', inputFilename,
          '-i', paletteFile,
          '-ss', startTime,
          '-t', duration,
          '-filter_complex', `fps=${fps},scale=-1:${scaleHeight}:flags=lanczos[x];[x][1:v]paletteuse`,
          '-y', outputFilename
        ];
      } else {
        args = [
          '-i', inputFilename,
          '-ss', startTime,
          '-t', duration,
          '-vf', `fps=${fps},scale=-1:${scaleHeight}`,
          '-c:v', 'libwebp',
          '-quality', '80',
          '-y', outputFilename
        ];
      }

      const result = await FFmpegUtils.executeFFmpegCommand(args);
      
      return {
        success: result.success,
        message: result.success ? `Converted to ${format} successfully` : `Failed to convert to ${format}`,
        output: result.output,
        outputFile: result.success ? outputFilename : undefined,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to convert video',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
});

// Analyze Media Tool
export const analyzeMediaTool = createTool({
  id: 'analyze-media',
  description: 'Analyze media file properties using ffprobe',
  inputSchema: z.object({
    inputFilename: z.string().describe('Input media filename')
  }),
  execute: async ({ context }) => {
    const { inputFilename } = context;
    
    try {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        inputFilename
      ];

      const result = await FFmpegUtils.executeFFprobeCommand(args);
      
      if (result.success) {
        const analysis = FFmpegUtils.parseFFprobeOutput(result.output);
        return {
          success: true,
          message: 'Media analysis completed',
          analysis,
          output: result.output
        };
      } else {
        return {
          success: false,
          message: 'Failed to analyze media',
          error: result.error
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to analyze media',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
});

// Batch Process Tool
export const batchProcessTool = createTool({
  id: 'batch-process',
  description: 'Process multiple files with the same operation',
  inputSchema: z.object({
    filenames: z.array(z.string()).describe('Array of filenames to process'),
    operation: z.string().describe('Operation to perform (e.g., "convert", "resize")')
  }),
  execute: async ({ context }) => {
    const { filenames, operation } = context;
    
    try {
      const results = [];
      
      for (const filename of filenames) {
        let result;
        
        switch (operation) {
          case 'convert':
            const outputFilename = `converted_${filename}`;
            const args = ['-i', filename, '-c:v', 'libx264', '-preset', 'medium', outputFilename];
            result = await FFmpegUtils.executeFFmpegCommand(args);
            break;
          case 'resize':
            const resizeFilename = `resized_${filename}`;
            const resizeArgs = ['-i', filename, '-vf', 'scale=1280:720', resizeFilename];
            result = await FFmpegUtils.executeFFmpegCommand(resizeArgs);
            break;
          default:
            result = { success: false, output: '', error: 'Unknown operation' };
        }
        
        results.push({
          filename,
          success: result.success,
          output: result.output,
          error: result.error
        });
      }
      
      return {
        success: true,
        message: 'Batch processing completed',
        results
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to process batch',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
});

// Extract Bitstream Tool
export const extractBitstreamTool = createTool({
  id: 'extract-bitstream',
  description: 'Extract bitstream from media file',
  inputSchema: z.object({
    inputFilename: z.string().describe('Input media filename'),
    streamType: z.string().describe('Type of stream to extract (video, audio, subtitle)')
  }),
  execute: async ({ context }) => {
    const { inputFilename, streamType } = context;
    
    try {
      const outputFilename = `extracted_${streamType}_${inputFilename}`;
      let args: string[];

      switch (streamType) {
        case 'video':
          args = ['-i', inputFilename, '-map', '0:v:0', '-c', 'copy', outputFilename];
          break;
        case 'audio':
          args = ['-i', inputFilename, '-map', '0:a:0', '-c', 'copy', outputFilename];
          break;
        case 'subtitle':
          args = ['-i', inputFilename, '-map', '0:s:0', '-c', 'copy', outputFilename];
          break;
        default:
          return {
            success: false,
            message: 'Invalid stream type',
            error: 'Stream type must be video, audio, or subtitle'
          };
      }

      const result = await FFmpegUtils.executeFFmpegCommand(args);
      
      return {
        success: result.success,
        message: result.success ? 'Bitstream extracted successfully' : 'Failed to extract bitstream',
        output: result.output,
        outputFile: result.success ? outputFilename : undefined,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to extract bitstream',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
});

// Change Speed Tool
export const changeSpeedTool = createTool({
  id: 'change-speed',
  description: 'Change the playback speed of a video',
  inputSchema: z.object({
    inputFilename: z.string().describe('Input video filename'),
    speed: z.string().describe('Speed multiplier (e.g., 2.0 for 2x speed, 0.5 for 0.5x speed)')
  }),
  execute: async ({ context }) => {
    const { inputFilename, speed } = context;
    
    try {
      const outputFilename = `speed_${speed}x_${inputFilename}`;
      const args = [
        '-i', inputFilename,
        '-filter:v', `setpts=${1/parseFloat(speed)}*PTS`,
        '-filter:a', `atempo=${speed}`,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        outputFilename
      ];

      const result = await FFmpegUtils.executeFFmpegCommand(args);
      
      return {
        success: result.success,
        message: result.success ? 'Speed changed successfully' : 'Failed to change speed',
        output: result.output,
        outputFile: result.success ? outputFilename : undefined,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to change speed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
});

// Generate Thumbnails Tool
export const generateThumbnailsTool = createTool({
  id: 'generate-thumbnails',
  description: 'Generate thumbnails from video',
  inputSchema: z.object({
    inputFilename: z.string().describe('Input video filename'),
    timestamp: z.string().describe('Timestamp for thumbnail (HH:MM:SS format)'),
    cols: z.number().describe('Number of columns for grid'),
    rows: z.number().describe('Number of rows for grid'),
    multipleSheets: z.boolean().describe('Generate multiple sheets'),
    interval: z.string().describe('Interval between thumbnails (HH:MM:SS format)'),
    duration: z.string().describe('Duration to process (HH:MM:SS format)')
  }),
  execute: async ({ context }) => {
    const { inputFilename, timestamp, cols, rows, multipleSheets, interval, duration } = context;
    
    try {
      let outputFilename: string;
      let args: string[];

      if (multipleSheets) {
        outputFilename = `thumbnails_${inputFilename}_%d.jpg`;
        args = [
          '-i', inputFilename,
          '-ss', timestamp,
          '-t', duration,
          '-vf', `fps=1/${interval},scale=320:240,tile=${cols}x${rows}`,
          '-y', outputFilename
        ];
      } else {
        outputFilename = `thumbnail_${inputFilename}.jpg`;
        args = [
          '-i', inputFilename,
          '-ss', timestamp,
          '-vframes', '1',
          '-vf', `scale=320:240`,
          '-y', outputFilename
        ];
      }

      const result = await FFmpegUtils.executeFFmpegCommand(args);
      
      return {
        success: result.success,
        message: result.success ? 'Thumbnails generated successfully' : 'Failed to generate thumbnails',
        output: result.output,
        outputFile: result.success ? outputFilename : undefined,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to generate thumbnails',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
});

// Resize Video Tool
export const resizeVideoTool = createTool({
  id: 'resize-video',
  description: 'Resize video dimensions',
  inputSchema: z.object({
    inputFilename: z.string().describe('Input video filename'),
    resolution: z.string().describe('Target resolution (e.g., 1920x1080, 1280x720)'),
    customWidth: z.string().describe('Custom width (if resolution is custom)'),
    customHeight: z.string().describe('Custom height (if resolution is custom)')
  }),
  execute: async ({ context }) => {
    const { inputFilename, resolution, customWidth, customHeight } = context;
    
    try {
      const outputFilename = `resized_${inputFilename}`;
      let scaleFilter: string;

      if (resolution === 'custom') {
        scaleFilter = `scale=${customWidth}:${customHeight}`;
      } else {
        scaleFilter = `scale=${resolution}`;
      }

      const args = [
        '-i', inputFilename,
        '-vf', scaleFilter,
        '-c:v', 'libx264',
        '-preset', 'medium',
        outputFilename
      ];

      const result = await FFmpegUtils.executeFFmpegCommand(args);
      
      return {
        success: result.success,
        message: result.success ? 'Video resized successfully' : 'Failed to resize video',
        output: result.output,
        outputFile: result.success ? outputFilename : undefined,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to resize video',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
});

// Join Files Tool
export const joinFilesTool = createTool({
  id: 'join-files',
  description: 'Join multiple media files',
  inputSchema: z.object({
    filenames: z.array(z.string()).describe('Array of filenames to join'),
    output: z.string().optional().describe('Output filename')
  }),
  execute: async ({ context }) => {
    const { filenames, output } = context;
    
    try {
      const outputFilename = output || `joined_${filenames[0]}`;
      const listFile = 'filelist.txt';
      
      // Create file list
      const fileList = filenames.map(filename => `file '${filename}'`).join('\n');
      await writeFile(listFile, fileList);

      const args = [
        '-f', 'concat',
        '-safe', '0',
        '-i', listFile,
        '-c', 'copy',
        outputFilename
      ];

      const result = await FFmpegUtils.executeFFmpegCommand(args);
      
      return {
        success: result.success,
        message: result.success ? 'Files joined successfully' : 'Failed to join files',
        output: result.output,
        outputFile: result.success ? outputFilename : undefined,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to join files',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
}); 