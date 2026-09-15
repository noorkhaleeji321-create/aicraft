import { Agent } from './Agent.js';
import {
  PipelineContext,
  PipelineStage,
  VideoGenerationInput,
  VideoGenerationOutput,
  GeneratedFrame,
  CinematographyOutput,  // FIXED: explicit import
  Shot,                   // FIXED: explicit import
} from '../types/pipeline.js';
import { v4 as uuidv4 } from 'uuid';

export class VideoGenerationAgent extends Agent {
  name = 'VideoGenerationAgent';
  stage: PipelineStage = 'VIDEO_GENERATION';

  async process(context: PipelineContext): Promise<PipelineContext> {
    const cinematography = context.data.cinematography;
    const characters = context.data.characters;
    const world = context.data.world;
    const script = context.data.script;
    if (!cinematography) throw new Error('CinematographyAgent must run before VideoGenerationAgent.');
    if (!characters) throw new Error('CharacterAgent must run before VideoGenerationAgent.');
    if (!world) throw new Error('WorldAgent must run before VideoGenerationAgent.');
    if (!script) throw new Error('ScriptAgent must run before VideoGenerationAgent.');

    this._log(context, `🎥 Generating video frames for ${cinematography.shots.length} shots`, 'info');
    await this._simulateDelay();

    const frames = this._generateFrames(cinematography, characters, world, script);
    const totalDuration = frames.reduce((sum, f) => sum + (f.duration || 0), 0);

    const output: VideoGenerationOutput = {
      frames,
      resolution: '1920x1080',
      frameRate: 24,
      totalDuration,
      generationStatus: 'completed',
    };

    context.data.videoFrames = output;
    context.currentStage = 'VIDEO_GENERATION';

    this._log(context, `✅ Generated ${frames.length} frames, ${totalDuration.toFixed(1)}s total @ ${output.resolution}`, 'success');
    return context;
  }

  private _generateFrames(
    cinematography: CinematographyOutput,
    characters: any,
    world: any,
    script: any
  ): GeneratedFrame[] {
    const frames: GeneratedFrame[] = [];
    let frameIndex = 0;

    for (const shot of cinematography.shots) {
      const scene = script.scenes.find((s: any) => s.id === shot.sceneId);
      const worldScene = world.scenes.find((w: any) => w.sceneId === shot.sceneId);
      const character = characters.characters[0]; // Primary character for demo

      // Generate 1-3 frames per shot for demo
      const frameCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < frameCount; i++) {
        frameIndex++;
        const timestamp = frames.reduce((sum: number, f: GeneratedFrame) => sum + (f.duration || 0), 0);

        const frame: GeneratedFrame = {
          id: uuidv4(),
          shotId: shot.id,
          sceneId: shot.sceneId,
          frameNumber: frameIndex,
          timestamp,
          prompt: this._buildPrompt(shot, scene, worldScene, character, i),
          duration: Math.round(shot.duration / frameCount * 10) / 10,
          status: 'generated',
          generationTime: 2000 + Math.floor(Math.random() * 3000),
        };
        frames.push(frame);
      }
    }

    return frames;
  }

  private _buildPrompt(
    shot: Shot,
    scene: any,
    worldScene: any,
    character: any,
    frameIndex: number
  ): string {
    const style = world?.overallStyle || 'cinematic realism';
    const palette = world?.colorPalette?.join(', ') || '#1a1a2e, #e94560';

    return [
      `Shot: ${shot.shotType.replace('-', ' ')}, ${shot.cameraMovement} movement`,
      `Location: ${scene?.location || 'unspecified'}, ${scene?.timeOfDay || 'unknown'}`,
      `Lighting: ${worldScene?.lighting || 'cinematic'}, ${worldScene?.styleModifiers?.join(', ') || 'natural'}`,
      `Character: ${character?.name || 'protagonist'}, ${character?.appearance?.clothing || ''}`,
      `Style: ${style}, palette: ${palette}`,
      `Focal length: ${shot.focalLength || '50mm'}, DOF: ${shot.depthOfField || 'medium'}`,
      `Mood: ${world?.mood || 'contemplative'}`,
      `Details: ${shot.description}`,
    ].join('. ');
  }

  private async _simulateDelay(): Promise<void> {
    await new Promise(r => setTimeout(r, this.processingDelayMs * 2));
  }
}
