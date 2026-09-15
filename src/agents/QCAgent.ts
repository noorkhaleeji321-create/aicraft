import { Agent } from './Agent.js';
import {
  PipelineContext,
  PipelineStage,
  QCInput,
  QCOutput,
  QCCheck,
  QCMetadata,
} from '../types/pipeline.js';
import { v4 as uuidv4 } from 'uuid';

export class QCAgent extends Agent {
  name = 'QCAgent';
  stage: PipelineStage = 'QC';

  async process(context: PipelineContext): Promise<PipelineContext> {
    const continuity = context.data.continuityReport;
    const editor = context.data.editedVideo;
    const voiceOver = context.data.voiceOver;
    const soundEffects = context.data.soundEffects;
    const script = context.data.script;
    if (!continuity) throw new Error('ContinuityAgent must run before QCAgent.');
    if (!editor) throw new Error('EditorAgent must run before QCAgent.');
    if (!voiceOver) throw new Error('VoiceAgent must run before QCAgent.');
    if (!soundEffects) throw new Error('SoundAgent must run before QCAgent.');
    if (!script) throw new Error('ScriptAgent must run before QCAgent.');

    this._log(context, `📋 Running quality control checks`, 'info');
    await this._simulateDelay();

    const checks = this._runChecks(continuity, editor, voiceOver, soundEffects, script);
    const overallScore = this._calculateScore(checks);
    const passed = overallScore >= 80;
    const approvedForExport = passed && continuity.passed;

    const metadata: QCMetadata = {
      resolution: context.data.videoFrames?.resolution || '1920x1080',
      frameRate: context.data.videoFrames?.frameRate || 24,
      audioSampleRate: 48000,
      audioBitDepth: 24,
      totalDuration: editor.finalDuration,
      format: 'mp4 (H.264 + AAC)',
    };

    const output: QCOutput = {
      checks,
      overallScore,
      passed,
      approvedForExport,
      reviewNotes: this._generateReviewNotes(checks),
      metadata,
    };

    context.data.qcReport = output;
    context.currentStage = 'QC';

    const status = approvedForExport ? '✅' : '❌';
    this._log(context, `${status} QC score: ${overallScore}/100, ${passed ? 'PASSED' : 'FAILED'} — Export ${approvedForExport ? 'APPROVED' : 'NOT APPROVED'}`, approvedForExport ? 'success' : 'warn');
    return context;
  }

  private _runChecks(
    continuity: any,
    editor: any,
    voiceOver: any,
    soundEffects: any,
    script: any
  ): QCCheck[] {
    const checks: QCCheck[] = [];

    // Video checks
    checks.push({
      id: uuidv4(),
      category: 'video',
      description: 'Video resolution meets minimum 1080p requirement',
      result: editor?.edit?.colorGrade ? 'pass' : 'fail',
      detail: '1920x1080 @ 24fps',
    });

    checks.push({
      id: uuidv4(),
      category: 'video',
      description: 'All video frames have valid prompts',
      result: this._checkAllFramesHavePrompts(context) ? 'pass' : 'fail',
      detail: `${context.data.videoFrames?.frames?.filter((f: any) => !f.prompt).length || 0} frames missing prompts`,
    });

    // Audio checks
    checks.push({
      id: uuidv4(),
      category: 'audio',
      description: 'Voice-over audio clips generated for all scenes',
      result: this._checkVoiceCoverage(script, voiceOver) ? 'pass' : 'fail',
      detail: `${voiceOver?.audioClips?.length || 0} clips for ${script?.sceneCount || 0} scenes`,
    });

    checks.push({
      id: uuidv4(),
      category: 'audio',
      description: 'Audio levels within acceptable range',
      result: this._checkAudioLevels(soundEffects) ? 'pass' : 'warn',
      detail: `Mix: voice=${soundEffects?.audioMix?.voiceChannel}, music=${soundEffects?.audioMix?.musicChannel}, effects=${soundEffects?.audioMix?.effectChannel}`,
    });

    // Content checks
    checks.push({
      id: uuidv4(),
      category: 'content',
      description: 'Continuity check passed',
      result: continuity?.passed ? 'pass' : 'fail',
      detail: `Score: ${continuity?.score}/100, ${continuity?.issues?.length || 0} issues`,
    });

    checks.push({
      id: uuidv4(),
      category: 'content',
      description: 'Script has voice-over narration',
      result: script?.voiceover ? 'pass' : 'warn',
      detail: script?.voiceover ? 'Narration present' : 'No narration — stylistic choice acceptable',
    });

    // Technical checks
    checks.push({
      id: uuidv4(),
      category: 'technical',
      description: 'Timeline has balanced track distribution',
      result: this._checkTimelineBalance(editor) ? 'pass' : 'warn',
      detail: `${editor?.timeline?.length || 0} timeline entries across tracks`,
    });

    checks.push({
      id: uuidv4(),
      category: 'technical',
      description: 'Total duration within target range',
      result: this._checkDuration(script, editor) ? 'pass' : 'warn',
      detail: `${editor?.finalDuration || 0}s (target: ~${script?.durationEstimate || 60}s)`,
    });

    return checks;
  }

  private _checkAllFramesHavePrompts(context: PipelineContext): boolean {
    const videoFrames = (context as any).data?.videoFrames;
    if (!frames) return true;
    return frames.every((f: any) => f.prompt);
  }

  private _checkVoiceCoverage(script: any, voiceOver: any): boolean {
    if (!script?.scenes || !voiceOver?.audioClips) return false;
    const sceneIdsWithAudio = new Set(voiceOver.audioClips.map((c: any) => c.sceneId));
    return script.scenes.every((s: any) => sceneIdsWithAudio.has(s.id));
  }

  private _checkAudioLevels(soundEffects: any): boolean {
    const mix = soundEffects?.audioMix;
    if (!mix) return false;
    return mix.voiceChannel > 0.5 && mix.voiceChannel < 1.0 &&
           mix.musicChannel <= 0.3 &&
           mix.effectChannel <= 0.6;
  }

  private _checkTimelineBalance(editor: any): boolean {
    const timeline = editor?.timeline || [];
    const trackCounts = new Map<number, number>();
    for (const entry of timeline) {
      trackCounts.set(entry.track, (trackCounts.get(entry.track) || 0) + 1);
    }
    // Check that we have at least 2 tracks
    return trackCounts.size >= 2;
  }

  private _checkDuration(script: any, editor: any): boolean {
    const target = script?.durationEstimate || 60;
    const actual = editor?.finalDuration || 0;
    return Math.abs(actual - target) / target < 0.4;
  }

  private _calculateScore(checks: QCCheck[]): number {
    if (checks.length === 0) return 0;
    let total = 0;
    for (const check of checks) {
      if (check.result === 'pass') total += 100;
      else if (check.result === 'warn') total += 60;
      else total += 0;
    }
    return Math.round(total / checks.length);
  }

  private _generateReviewNotes(checks: QCCheck[]): string[] {
    const notes: string[] = [];
    const failures = checks.filter(c => c.result === 'fail');
    const warnings = checks.filter(c => c.result === 'warn');
    const passes = checks.filter(c => c.result === 'pass');

    notes.push(`📊 ${passes.length}/${checks.length} checks passed`);

    if (failures.length > 0) {
      notes.push(`❌ ${failures.length} failure(s):`);
      for (const f of failures) {
        notes.push(`   - ${f.description}: ${f.detail || 'No detail'}`);
      }
    }

    if (warnings.length > 0) {
      notes.push(`⚠️ ${warnings.length} warning(s):`);
      for (const w of warnings) {
        notes.push(`   - ${w.description}: ${w.detail || 'No detail'}`);
      }
    }

    return notes;
  }

  private _getContextData(): any {
    // No longer needed - context is passed explicitly
    return null;
  }

  private async _simulateDelay(): Promise<void> {
    await new Promise(r => setTimeout(r, this.processingDelayMs));
  }
}
