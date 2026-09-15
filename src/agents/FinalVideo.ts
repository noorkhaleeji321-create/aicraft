import { Agent } from './Agent.js';
import {
  PipelineContext,
  PipelineStage,
  FinalVideoInput,
  FinalVideoOutput,
  FinalVideoMetadata,
} from '../types/pipeline.js';

export class FinalVideoAgent extends Agent {
  name = 'FinalVideoAgent';
  stage: PipelineStage = 'FINAL_VIDEO';

  async process(context: PipelineContext): Promise<PipelineContext> {
    const qc = context.data.qcReport;
    const editor = context.data.editedVideo;
    const voiceOver = context.data.voiceOver;
    const soundEffects = context.data.soundEffects;
    if (!qc) throw new Error('QCAgent must run before FinalVideoAgent.');
    if (!editor) throw new Error('EditorAgent must run before FinalVideoAgent.');
    if (!voiceOver) throw new Error('VoiceAgent must run before FinalVideoAgent.');
    if (!soundEffects) throw new Error('SoundAgent must run before FinalVideoAgent.');

    if (!qc.approvedForExport) {
      throw new Error(`Cannot export: QC did not approve. Score: ${qc.overallScore}/100`);
    }

    this._log(context, `🎬 Assembling final video export`, 'info');
    await this._simulateDelay();

    const metadata: FinalVideoMetadata = {
      title: this._generateTitle(context),
      description: context.data.script?.voiceover || 'AI-generated visual narrative',
      duration: editor.finalDuration,
      resolution: context.data.videoFrames?.resolution || '1920x1080',
      frameRate: context.data.videoFrames?.frameRate || 24,
      fileSize: this._estimateFileSize(editor.finalDuration),
      format: 'mp4',
      tags: this._generateTags(context),
    };

    const output: FinalVideoOutput = {
      videoUrl: `https://cdn.aicraft.dev/outputs/${context.runId}.mp4`,
      thumbnailUrl: `https://cdn.aicraft.dev/outputs/${context.runId}_thumb.jpg`,
      metadata,
      exportStatus: 'completed',
      exportTimestamp: Date.now(),
    };

    context.data.finalVideo = output;
    context.currentStage = 'FINAL_VIDEO';

    this._log(context, `✅ Final video exported: ${metadata.duration.toFixed(1)}s, ${metadata.resolution}, ${(metadata.fileSize / 1024 / 1024).toFixed(1)}MB`, 'success');
    this._log(context, `📹 Available at: ${output.videoUrl}`, 'info');
    return context;
  }

  private _generateTitle(context: PipelineContext): string {
    const script = context.data.script;
    const mood = context.data.world?.mood || 'untitled';
    const genre = script?.scenes?.[0]?.description?.toLowerCase() || 'story';

    const titleTemplates = [
      `The ${mood.split(',')[0].trim()} Journey`,
      `Echoes of ${genre}`,
      `Beyond the ${context.data.world?.overallStyle?.split(' ')[0] || 'Horizon'}`,
      `A ${mood.split(',')[0].trim()} Story`,
    ];

    return titleTemplates[Math.floor(Math.random() * titleTemplates.length)];
  }

  private _estimateFileSize(duration: number): number {
    // Rough estimate: 1080p H.264 @ ~5 Mbps
    const bitrate = 5000000; // 5 Mbps
    return Math.round((bitrate * duration) / 8);
  }

  private _generateTags(context: PipelineContext): string[] {
    const tags: string[] = [];
    const script = context.data.script;
    const world = context.data.world;

    if (script?.scenes) {
      tags.push(`${script.scenes.length}-scene`);
      tags.push(`${script.durationEstimate}s`);
    }

    if (world?.overallStyle) {
      tags.push(world.overallStyle.toLowerCase().replace(/\s+/g, '-'));
    }

    tags.push('AI-generated');
    tags.push('AICraft');
    tags.push('cinematic');

    return tags;
  }

  private async _simulateDelay(): Promise<void> {
    await new Promise(r => setTimeout(r, this.processingDelayMs * 3));
  }
}
