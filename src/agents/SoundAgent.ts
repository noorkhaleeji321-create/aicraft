import { Agent } from './Agent.js';
import {
  PipelineContext,
  PipelineStage,
  SoundInput,
  SoundOutput,
  SoundEffect,
  MusicTrack,
  AudioMix,
} from '../types/pipeline.js';
import { v4 as uuidv4 } from 'uuid';

export class SoundAgent extends Agent {
  name = 'SoundAgent';
  stage: PipelineStage = 'SOUND';

  async process(context: PipelineContext): Promise<PipelineContext> {
    const script = context.data.script;
    const cinematography = context.data.cinematography;
    const world = context.data.world;
    if (!script) throw new Error('ScriptAgent must run before SoundAgent.');
    if (!cinematography) throw new Error('CinematographyAgent must run before SoundAgent.');
    if (!world) throw new Error('WorldAgent must run before SoundAgent.');

    this._log(context, `🔊 Designing soundscape for ${script.sceneCount} scenes`, 'info');
    await this._simulateDelay();

    const soundEffects = this._generateSoundEffects(script, cinematography, world);
    const backgroundMusic = this._generateMusic(script, world);
    const totalDuration = script.durationEstimate || 60;

    const output: SoundOutput = {
      soundEffects,
      backgroundMusic,
      totalDuration,
      audioMix: this._planMix(),
    };

    context.data.soundEffects = output;
    context.currentStage = 'SOUND';

    this._log(context, `✅ ${soundEffects.length} sound effects ${backgroundMusic ? '+ music track' : ''}, ${totalDuration}s mix`, 'success');
    return context;
  }

  private _generateSoundEffects(script: any, cinematography: any, world: any): SoundEffect[] {
    const effects: SoundEffect[] = [];
    let timestamp = 0;

    for (const scene of script.scenes) {
      const sceneShots = cinematography?.shots?.filter(s => s.sceneId === scene.id) || [];

      // Ambient/background for the scene
      effects.push({
        id: uuidv4(),
        sceneId: scene.id,
        type: 'ambiance',
        description: this._ambientForLocation(scene.location),
        startTimestamp: timestamp,
        endTimestamp: timestamp + scene.duration,
        volume: 0.15,
        status: 'generated',
      });

      // Scene-specific SFX
      const sfxMap: Record<string, string> = {
        'city': 'distant traffic, faint sirens, urban hum',
        'workspace': 'keyboard clicks, distant phone ring, HVAC hum',
        'forest': 'rustling leaves, distant birds, breeze through branches',
        'industrial': 'low machinery drone, metal echoes, compressed air hiss',
        'abstract': 'ethereal tones, particle shimmer, tonal bed',
      };

      const sfx = sfxMap[scene.location.toLowerCase().slice(0, 10)] || 'subtle environmental texture';
      effects.push({
        id: uuidv4(),
        sceneId: scene.id,
        type: 'sfx',
        description: sfx,
        startTimestamp: timestamp,
        endTimestamp: timestamp + scene.duration,
        volume: 0.25,
        status: 'generated',
      });

      // Shot-specific foley
      for (const shot of sceneShots.slice(0, 2)) {
        timestamp += shot.duration * 0.3;
        effects.push({
          id: uuidv4(),
          sceneId: scene.id,
          shotId: shot.id,
          type: 'foley',
          description: this._foleyForShot(shot),
          startTimestamp: timestamp,
          endTimestamp: timestamp + 1 + Math.random(),
          volume: 0.4,
          status: 'generated',
        });
        timestamp += shot.duration * 0.7;
      }

      timestamp += 0.5; // transition buffer
    }

    return effects;
  }

  private _ambientForLocation(location: string): string {
    const map: Record<string, string> = {
      'city': 'urban ambiance — distant traffic, building resonance, low city hum',
      'workspace': 'interior room tone — HVAC, computer fans, faint outside traffic',
      'forest': 'natural forest ambiance — wind, leaves, distant wildlife',
      'industrial': 'industrial drone — machinery, structure resonance, electrical hum',
      'abstract': 'textural bed — evolving tonal cluster, subtle particle sounds',
    };
    for (const [key, val] of Object.entries(map)) {
      if (location.toLowerCase().includes(key)) return val;
    }
    return 'general atmospheric bed';
  }

  private _foleyForShot(shot: any): string {
    if (shot.shotType === 'close-up') return 'subtle hand movements, fabric rustle, breath';
    if (shot.shotType === 'wide') return 'environmental scale — footsteps, distant activity';
    if (shot.cameraMovement === 'tracking') return 'movement footsteps, motion parallax audio';
    return 'scene-appropriate foley texture';
  }

  private _generateMusic(script: any, world: any): MusicTrack | undefined {
    // Only add music if it fits the mood
    if (!world?.mood?.includes('tense') && !world?.mood?.includes('foreboding')) {
      return undefined;
    }

    return {
      id: uuidv4(),
      mood: world.mood || 'contemplative',
      style: world.overallStyle || 'cinematic',
      startTimestamp: 0,
      endTimestamp: script.durationEstimate || 60,
      volume: 0.12,
    };
  }

  private _planMix(): AudioMix {
    return {
      voiceChannel: 0.85,
      musicChannel: 0.15,
      effectChannel: 0.5,
      masterVolume: 0.9,
    };
  }

  private async _simulateDelay(): Promise<void> {
    await new Promise(r => setTimeout(r, this.processingDelayMs));
  }
}
