import { Agent } from './Agent.js';
import {
  PipelineContext,
  PipelineStage,
  EditorInput,
  EditorOutput,
  VideoEdit,
  TimelineEntry,
  EditCut,
} from '../types/pipeline.js';
import { v4 as uuidv4 } from 'uuid';

export class EditorAgent extends Agent {
  name = 'EditorAgent';
  stage: PipelineStage = 'EDITOR';

  async process(context: PipelineContext): Promise<PipelineContext> {
    const videoFrames = context.data.videoFrames;
    const voiceOver = context.data.voiceOver;
    const soundEffects = context.data.soundEffects;
    const cinematography = context.data.cinematography;
    if (!videoFrames) throw new Error('VideoGenerationAgent must run before EditorAgent.');
    if (!voiceOver) throw new Error('VoiceAgent must run before EditorAgent.');
    if (!soundEffects) throw new Error('SoundAgent must run before EditorAgent.');
    if (!cinematography) throw new Error('CinematographyAgent must run before EditorAgent.');

    this._log(context, `✂️ Editing ${videoFrames.frames.length} frames with audio layers`, 'info');
    await this._simulateDelay();

    const edit = this._createEdit(cinematography);
    const timeline = this._buildTimeline(videoFrames, voiceOver, soundEffects);
    const finalDuration = this._calculateDuration(timeline);

    const output: EditorOutput = {
      edit,
      timeline,
      finalDuration,
      quality: 'draft',
    };

    context.data.editedVideo = output;
    context.currentStage = 'EDITOR';

    this._log(context, `✅ Edit assembled: ${timeline.length} timeline tracks, ${finalDuration.toFixed(1)}s`, 'success');
    return context;
  }

  private _createEdit(cinematography: any): VideoEdit {
    const cuts: EditCut[] = [];
    const transitions = cinematography.transitions || [];

    // Create cuts at each transition point
    for (const transition of transitions) {
      cuts.push({
        fromClipId: transition.fromScene,
        toClipId: transition.toScene,
        cutPoint: 0, // Will be refined by continuity
        reason: `Scene transition: ${transition.type}`,
      });
    }

    return {
      cuts,
      transitions: transitions.map(t => ({
        fromScene: t.fromScene,
        toScene: t.toScene,
        type: t.type,
        duration: t.duration,
      })),
      colorGrade: {
        primary: 'neutral cinematic',
        exposure: 0,
        contrast: 1.05,
        saturation: 1.0,
      },
    };
  }

  private _buildTimeline(
    videoFrames: any,
    voiceOver: any,
    soundEffects: any
  ): TimelineEntry[] {
    const timeline: TimelineEntry[] = [];
    let trackVideo = 0;
    let trackAudioVoice = 1;
    let trackAudioMusic = 2;
    let trackAudioFoley = 3;
    let layer = 0;

    // Video track
    for (const frame of videoFrames.frames) {
      timeline.push({
        id: uuidv4(),
        type: 'video',
        track: trackVideo,
        start: frame.timestamp,
        end: frame.timestamp + (frame.duration || 0.5),
        sourceId: frame.id,
        layer,
      });
    }

    // Voice track
    for (const clip of voiceOver.audioClips) {
      timeline.push({
        id: uuidv4(),
        type: 'audio',
        track: trackAudioVoice,
        start: clip.startTimestamp,
        end: clip.endTimestamp,
        sourceId: clip.id,
        layer: layer++,
      });
    }

    // Music track
    if (soundEffects.backgroundMusic) {
      const music = soundEffects.backgroundMusic;
      timeline.push({
        id: uuidv4(),
        type: 'audio',
        track: trackAudioMusic,
        start: music.startTimestamp,
        end: music.endTimestamp,
        sourceId: music.id,
        layer: layer++,
      });
    }

    // SFX track
    for (const effect of soundEffects.soundEffects) {
      timeline.push({
        id: uuidv4(),
        type: 'audio',
        track: trackAudioFoley,
        start: effect.startTimestamp,
        end: effect.endTimestamp,
        sourceId: effect.id,
        layer: layer++,
      });
    }

    return timeline;
  }

  private _calculateDuration(timeline: TimelineEntry[]): number {
    let maxEnd = 0;
    for (const entry of timeline) {
      if (entry.end > maxEnd) maxEnd = entry.end;
    }
    return Math.round(maxEnd * 10) / 10;
  }

  private async _simulateDelay(): Promise<void> {
    await new Promise(r => setTimeout(r, this.processingDelayMs * 2));
  }
}
