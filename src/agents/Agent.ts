import { PipelineContext, PipelineData, PipelineStage } from '../types/pipeline.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Base agent class for all AICraft pipeline agents.
 * Each agent implements execute() to transform the pipeline context.
 */
export abstract class Agent {
  /** Agent name/identifier */
  abstract name: string;

  /** Pipeline stage this agent belongs to */
  abstract stage: PipelineStage;

  /** Whether this agent is enabled (for testing/skipping) */
  enabled: boolean = true;

  /** Simulated processing delay in ms (for demo/realism) */
  processingDelayMs: number = 100;

  /** Current execution state */
  protected _isExecuting: boolean = false;

  /**
   * Execute the agent on the given context.
   * Returns the updated context.
   */
  async execute(context: PipelineContext): Promise<PipelineContext> {
    if (!this.enabled) {
      this._log(context, `⏭️  Skipped (disabled)`, 'info');
      return context;
    }

    this._isExecuting = true;
    const startTime = Date.now();

    this._log(context, `🚀 Starting agent: ${this.name}`, 'info');
    this._log(context, `   Stage: ${this.stage}`, 'info');

    try {
      // Allow subclasses to do pre-processing
      await this.onStart(context);

      // Core execution - to be implemented by subclasses
      const result = await this.process(context);

      const elapsed = Date.now() - startTime;
      this._log(context, `✅ ${this.name} completed in ${elapsed}ms`, 'success');

      return result;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      this._log(context, `❌ ${this.name} failed after ${elapsed}ms: ${message}`, 'error');
      context.failed = true;
      context.errorMessage = message;
      throw error;
    } finally {
      this._isExecuting = false;
    }
  }

  /**
   * Called before the main process() runs.
   * Override for setup logic.
   */
  protected async onStart(context: PipelineContext): Promise<void> {
    // Default: no-op
  }

  /**
   * Main processing logic - MUST be implemented by subclasses.
   * Takes the current context and returns an updated context.
   */
  protected abstract process(context: PipelineContext): Promise<PipelineContext>;

  /**
   * Add a log entry to the context.
   */
  protected _log(
    context: PipelineContext,
    message: string,
    level: 'info' | 'success' | 'warn' | 'error' = 'info'
  ): void {
    context.log.push({
      id: uuidv4(),
      agent: this.name,
      stage: this.stage,
      message,
      level,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check if this agent is currently executing.
   */
  get isExecuting(): boolean {
    return this._isExecuting;
  }
}

/**
 * Log entry for tracking agent execution.
 */
export interface AgentLogEntry {
  id: string;
  agent: string;
  stage: PipelineStage;
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
  timestamp: string;
}

/**
 * Helper: create a new empty PipelineContext for a run.
 */
export function createPipelineContext(runId?: string): PipelineContext {
  return {
    runId: runId || uuidv4(),
    currentStage: 'SCRIPT', // Will be updated by pipeline manager
    data: {},
    log: [],
    failed: false,
  };
}
