import { exec } from 'child_process';
import { openClawClientService } from './openclaw-client.service';

export interface CommandResult {
  status: 'success' | 'error';
  data?: {
    output?: string;
    exitCode?: number;
  };
  error?: {
    code: string;
    message: string;
  };
  executionTimeMs: number;
  source?: 'openclaw' | 'child_process';
}

/**
 * Command Executor
 *
 * 执行 shell 命令，支持两种模式：
 * 1. OpenClaw 模式 - 通过 OpenClaw Gateway 执行（推荐）
 * 2. child_process 模式 - 直接执行（降级）
 */
export class CommandExecutor {
  private static readonly DEFAULT_TIMEOUT = 30_000;
  private static readonly MAX_OUTPUT_SIZE = 1024 * 512;

  async execute(
    command: string,
    timeout = CommandExecutor.DEFAULT_TIMEOUT,
  ): Promise<CommandResult> {
    // 优先使用 OpenClaw 模式
    if (openClawClientService.isClientConnected()) {
      try {
        const result = await this.executeViaOpenClaw(command, timeout);
        // Only return OpenClaw result if it actually executed successfully with tool output
        if (result.status === 'success' && !result.error) {
          return { ...result, source: 'openclaw' };
        }
        // Any error (scope, no tool execution, agent error) → fall back
        console.log(`[CommandExecutor] OpenClaw returned ${result.error?.code || 'error'}, falling back to child_process`);
      } catch (error) {
        console.warn(
          '[CommandExecutor] OpenClaw execution failed, falling back to child_process:',
          error,
        );
      }
    }

    // 降级到 child_process
    const result = await this.executeWithChildProcess(command, timeout);
    return { ...result, source: 'child_process' };
  }

  /**
   * 通过 OpenClaw Gateway 执行命令
   */
  private async executeViaOpenClaw(
    command: string,
    timeout: number,
  ): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      const client = openClawClientService.getClient();
      if (!client) {
        throw new Error('OpenClaw client not available');
      }

      // Use streaming chat API to discriminate tool_result from text
      const message = `Execute this shell command immediately. Do not ask for approval or confirmation, just run it and return the output:\n\n${command}`;

      const { toolResults, textParts, errorText } = await this.runAgentChat(
        client, message, timeout,
      );

      const executionTimeMs = Date.now() - startTime;

      if (errorText) {
        return {
          status: 'error',
          error: {
            code: 'OPENCLAW_AGENT_ERROR',
            message: errorText,
          },
          data: {
            output: toolResults.join('\n') || textParts.join('') || undefined,
          },
          executionTimeMs,
        };
      }

      // If agent only produced text (no tool calls), signal fallback
      if (toolResults.length === 0) {
        return {
          status: 'error',
          error: { code: 'NO_TOOL_EXECUTION', message: 'Agent did not call any tools' },
          executionTimeMs,
        };
      }

      const output = toolResults.join('\n');
      const exitCode = this.inferExitCode(output, true);

      return {
        status: exitCode === 0 ? 'success' : 'error',
        data: { output, exitCode },
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      return {
        status: 'error',
        error: {
          code: 'OPENCLAW_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
        executionTimeMs,
      };
    }
  }

  /**
   * 使用 child_process 执行命令（降级模式）
   */
  private async executeWithChildProcess(
    command: string,
    timeout: number,
  ): Promise<CommandResult> {
    const startTime = Date.now();

    return new Promise<CommandResult>((resolve) => {
      exec(
        command,
        {
          timeout,
          maxBuffer: CommandExecutor.MAX_OUTPUT_SIZE,
          shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
        },
        (error, stdout, stderr) => {
          const executionTimeMs = Date.now() - startTime;

          if (error) {
            if ((error as any).killed) {
              resolve({
                status: 'error',
                error: {
                  code: 'COMMAND_TIMEOUT',
                  message: `Command timed out (${timeout}ms)`,
                },
                data: {
                  output: stdout || stderr || undefined,
                  exitCode: (error as any).code ?? 1,
                },
                executionTimeMs,
              });
              return;
            }

            resolve({
              status: 'error',
              data: {
                output: stderr || stdout || error.message,
                exitCode: (error as any).code ?? 1,
              },
              error: {
                code: 'EXEC_ERROR',
                message: error.message,
              },
              executionTimeMs,
            });
            return;
          }

          resolve({
            status: 'success',
            data: {
              output: stdout || '(no output)',
              exitCode: 0,
            },
            executionTimeMs,
          });
        },
      );
    });
  }


  /**
   * Infer exit code from command output.
   * If we got a tool_result, the command ran — default to 0 unless patterns suggest failure.
   */
  private inferExitCode(output: string, hasToolResult: boolean): number {
    if (!hasToolResult) return 0;

    // Check for common error patterns in tool_result output
    const errorPatterns = [
      /exit code[:\s]+(\d+)/i,
      /exited with[:\s]+(\d+)/i,
      /return code[:\s]+(\d+)/i,
    ];

    for (const pattern of errorPatterns) {
      const match = output.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return 0;
  }

  /**
   * Run agent chat and collect streaming results.
   */
  private async runAgentChat(
    client: import('./openclaw-ws-client').OpenClawWsClient,
    message: string,
    timeout: number,
  ): Promise<{ toolResults: string[]; textParts: string[]; errorText: string }> {
    const toolResults: string[] = [];
    const textParts: string[] = [];
    let errorText = '';

    for await (const chunk of client.chat(message, { timeout })) {
      switch (chunk.type) {
        case 'tool_result': toolResults.push(chunk.text); break;
        case 'text': textParts.push(chunk.text); break;
        case 'error': errorText = chunk.text; break;
        case 'done': break;
      }
    }

    return { toolResults, textParts, errorText };
  }
}

// 单例实例
export const commandExecutor = new CommandExecutor();
