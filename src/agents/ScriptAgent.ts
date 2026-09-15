import { Agent } from './Agent.js';
import {
  PipelineContext,
  PipelineData,
  PipelineStage,
  ScriptInput,
  ScriptOutput,
  ScriptScene,
} from '../types/pipeline.js';
import { v4 as uuidv4 } from 'uuid';

export class ScriptAgent extends Agent {
  name = 'ScriptAgent';
  stage: PipelineStage = 'SCRIPT';

  async process(context: PipelineContext): Promise<PipelineContext> {
    const input = this._extractInput<ScriptInput>(context, 'script');

    this._log(context, `📝 Generating script from prompt: "${input.prompt}"`, 'info');

    // Simulate script generation
    await this._simulateDelay();

    const genre = input.genre || 'drama';
    const tone = input.tone || 'neutral';
    const targetDuration = input.targetDuration || 60;

    const scenes = this._generateScenes(genre, tone, targetDuration);
    const voiceover = this._generateVoiceover(scenes);

    const output: ScriptOutput = {
      sceneCount: scenes.length,
      scenes,
      voiceover,
      durationEstimate: scenes.reduce((sum, s) => sum + s.duration, 0),
    };

    context.data.script = output;
    context.currentStage = 'SCRIPT';

    this._log(context, `✅ Generated ${scenes.length} scenes, ~${output.durationEstimate}s total`, 'success');
    return context;
  }

  private _generateScenes(genre: string, tone: string, targetDuration: number): ScriptScene[] {
    const sceneCount = genre === 'short' ? 3 : genre === 'feature' ? 12 : 5;
    const avgSceneDuration = targetDuration / sceneCount;

    const sceneTemplates: Array<{
      title: string;
      location: string;
      timeOfDay: string;
      action: string;
    }> = [
      {
        title: 'Opening',
        location: 'City skyline at dawn',
        timeOfDay: 'dawn',
        action: 'Establish the world and main character. Visual hook to draw audience in.',
      },
      {
        title: 'Inciting Incident',
        location: 'Character\'s workspace',
        timeOfDay: 'morning',
        action: 'The protagonist encounters the central conflict or opportunity.',
      },
      {
        title: 'Rising Action',
        location: 'Journey through varied settings',
        timeOfDay: 'afternoon',
        action: 'Character faces escalating challenges, building tension.',
      },
      {
        title: 'Climax',
        location: 'Dramatic confrontation space',
        timeOfDay: 'dusk',
        action: 'Peak tension — the defining moment of the story.',
      },
      {
        title: 'Resolution',
        location: 'Return to opening location',
        timeOfDay: 'night',
        action: 'Closure. Show how the character and world have changed.',
      },
    ];

    const scenes: ScriptScene[] = [];
    for (let i = 0; i < sceneCount; i++) {
      const template = sceneTemplates[i % sceneTemplates.length];
      const scene: ScriptScene = {
        id: uuidv4(),
        sceneNumber: i + 1,
        title: template.title + (sceneCount > sceneTemplates.length ? ` (Part ${Math.floor(i / sceneTemplates.length) + 1})` : ''),
        description: `${template.action} [${genre} • ${tone} tone]`,
        location: template.location,
        timeOfDay: template.timeOfDay,
        characters: ['protagonist'],
        actionDescription: template.action,
        dialogue: [
          `"Every journey begins with a single step into the unknown."`,
          `"The real question isn't whether we can — it's whether we will."`,
          `"In the end, we are defined not by our answers, but by our questions."`,
        ].slice(0, Math.ceil(sceneCount / 3)),
        duration: Math.round(avgSceneDuration * (0.8 + Math.random() * 0.4)),
      };
      scenes.push(scene);
    }

    return scenes;
  }

  private _generateVoiceover(scenes: ScriptScene[]): string {
    return `A ${scenes.length}-scene narrative exploring themes of transformation and discovery. ` +
      `From the first glimpse of a world on the brink of change, to the final moment of resolution, ` +
      `this story takes the audience on a journey through challenge, choice, and consequence.`;
  }

  private _extractInput<T>(context: PipelineContext, key: string): T {
    // For the first agent, we get input from context parameters or defaults
    const param = (context as any).params;
    if (param && param[key]) return param[key] as T;
    // Return defaults
    if (key === 'script') {
      return {
        prompt: 'Create a compelling visual narrative about transformation.',
        genre: 'drama',
        targetDuration: 60,
        tone: 'inspirational',
      } as T;
    }
    return {} as T;
  }

  private async _simulateDelay(): Promise<void> {
    await new Promise(r => setTimeout(r, this.processingDelayMs));
  }
}
