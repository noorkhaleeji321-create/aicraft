import { Agent } from './Agent.js';
import {
  PipelineContext,
  PipelineStage,
  ScriptInput,
} from '../types/pipeline.js';
import { ScriptAgent } from './ScriptAgent.js';
import { CharacterAgent } from './CharacterAgent.js';
import { WorldAgent } from './WorldAgent.js';
import { CinematographyAgent } from './Cinematography.js';
import { VideoGenerationAgent } from './VideoGeneration.js';
import { VoiceAgent } from './VoiceAgent.js';
import { SoundAgent } from './SoundAgent.js';
import { EditorAgent } from './EditorAgent.js';
import { ContinuityAgent } from './ContinuityAgent.js';
import { QCAgent } from './QCAgent.js';
import { FinalVideoAgent } from './FinalVideo.js';

/**
 * MasterDirector - The orchestrator agent that coordinates all 12 agents.
 * It owns the agent instances and delegates execution in pipeline order.
 */
export class MasterDirector extends Agent {
  name = 'MasterDirector';
  stage: PipelineStage = 'SCRIPT'; // The director sets the stage

  // All 12 agents, in pipeline order
  private agents: Agent[] = [];

  constructor() {
    super();

    // Register all 12 agents in execution order
    this.agents = [
      new ScriptAgent(),
      new CharacterAgent(),
      new WorldAgent(),
      new CinematographyAgent(),
      new VideoGenerationAgent(),
      new VoiceAgent(),
      new SoundAgent(),
      new EditorAgent(),
      new ContinuityAgent(),
      new QCAgent(),
      new FinalVideoAgent(),
    ];

    // Give each agent a reference back if needed
    // (not used in this demo, but could enable cross-agent communication)
  }

  /**
   * Get the list of all registered agents.
   */
  getAgentList(): ReadonlyArray<Agent> {
    return this.agents;
  }

  /**
   * Get a specific agent by stage name.
   */
  getAgentByStage(stage: PipelineStage): Agent | undefined {
    return this.agents.find(a => a.stage === stage);
  }

  /**
   * Execute the full pipeline by delegating to each agent in order.
   * This is the entry point for running the entire AICraft pipeline.
   */
  async executePipeline(context: PipelineContext): Promise<PipelineContext> {
    this._log(context, `🎬 MasterDirector initializing pipeline with ${this.agents.length} agents`, 'info');
    this._log(context, `   Run ID: ${context.runId}`, 'info');

    // Execute each agent in sequence
    for (const agent of this.agents) {
      // Check if pipeline already failed
      if (context.failed) {
        this._log(context, `⛔ Pipeline halted — skipping ${agent.name} due to prior failure`, 'warn');
        continue;
      }

      // Update current stage
      context.currentStage = agent.stage;

      try {
        const result = await agent.execute(context);
        context = result;

        // Small delay between agents for readability
        await new Promise(r => setTimeout(r, 50));
      } catch (error) {
        // Agent throws → context.failed already set by agent
        this._log(context, `💥 Pipeline stopped at ${agent.name}: ${error instanceof Error ? error.message : String(error)}`, 'error');
        break;
      }
    }

    // Final summary
    const passed = !context.failed;
    const totalSteps = context.log.filter(l => l.level === 'success').length;
    const totalErrors = context.log.filter(l => l.level === 'error').length;

    this._log(context, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    this._log(context, `📊 Pipeline Complete: ${passed ? 'SUCCESS' : 'FAILED'}`, passed ? 'success' : 'error');
    this._log(context, `   Agents executed: ${totalSteps}/${this.agents.length}`, 'info');
    this._log(context, `   Errors: ${totalErrors}`, totalErrors > 0 ? 'error' : 'info');

    if (context.data.finalVideo) {
      this._log(context, `   Final video: ${context.data.finalVideo.videoUrl}`, 'info');
      this._log(context, `   Duration: ${(context.data.finalVideo.metadata.duration / 60).toFixed(2)} min`, 'info');
      this._log(context, `   Resolution: ${context.data.finalVideo.metadata.resolution}`, 'info');
    }

    this._log(context, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');

    return context;
  }

  /**
   * Execute a single agent by stage name.
   * Useful for testing individual agents or resuming from a specific stage.
   */
  async executeStage(context: PipelineContext, stage: PipelineStage): Promise<PipelineContext> {
    const agent = this.getAgentByStage(stage);
    if (!agent) {
      throw new Error(`No agent registered for stage: ${stage}`);
    }

    context.currentStage = stage;
    return agent.execute(context);
  }

  /**
   * Reset all agents to their initial state (clear any internal state).
   */
  reset(): void {
    // Agents are stateless in this implementation, but this
    // method exists for extensibility (e.g., caching, connection pools)
  }

  protected async process(_context: PipelineContext): Promise<PipelineContext> {
    // MasterDirector doesn't do its own processing —
    // it delegates to the executePipeline() method instead.
    // This is a design choice: the director IS the pipeline.
    throw new Error('MasterDirector should use executePipeline(), not execute() directly.');
  }

  private async _simulateDelay(): Promise<void> {
    await new Promise(r => setTimeout(r, this.processingDelayMs));
  }
}
