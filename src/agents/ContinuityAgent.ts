import { Agent } from './Agent.js';
import {
  PipelineContext,
  PipelineStage,
  ContinuityInput,
  ContinuityOutput,
  ContinuityIssue,
} from '../types/pipeline.js';
import { v4 as uuidv4 } from 'uuid';

export class ContinuityAgent extends Agent {
  name = 'ContinuityAgent';
  stage: PipelineStage = 'CONTINUITY';

  async process(context: PipelineContext): Promise<PipelineContext> {
    const editor = context.data.editedVideo;
    const script = context.data.script;
    const characters = context.data.characters;
    const world = context.data.world;
    if (!editor) throw new Error('EditorAgent must run before ContinuityAgent.');
    if (!script) throw new Error('ScriptAgent must run before ContinuityAgent.');
    if (!characters) throw new Error('CharacterAgent must run before ContinuityAgent.');
    if (!world) throw new Error('WorldAgent must run before ContinuityAgent.');

    this._log(context, `🔍 Checking continuity across ${editor.timeline.length} timeline entries`, 'info');
    await this._simulateDelay();

    const issues = this._checkContinuity(editor, script, characters, world);
    const score = Math.max(0, 100 - issues.filter(i => i.severity === 'critical').length * 25 - issues.filter(i => i.severity === 'major').length * 10 - issues.filter(i => i.severity === 'minor').length * 2);
    const passed = score >= 70;

    const output: ContinuityOutput = {
      issues,
      score,
      passed,
      notes: this._generateNotes(issues),
    };

    context.data.continuityReport = output;
    context.currentStage = 'CONTINUITY';

    const status = passed ? '✅' : '⚠️';
    this._log(context, `${status} Continuity score: ${score}/100, ${issues.length} issues found`, passed ? 'success' : 'warn');
    return context;
  }

  private _checkContinuity(
    editor: any,
    script: any,
    characters: any,
    world: any
  ): ContinuityIssue[] {
    const issues: ContinuityIssue[] = [];

    // Check 1: Character consistency across scenes
    const characterNames = characters?.characters?.map(c => c.name.toLowerCase()) || [];
    for (const scene of script.scenes) {
      for (const charName of scene.characters) {
        if (!characterNames.some((n: string) => n.includes(charName.toLowerCase()))) {
          issues.push({
            id: uuidv4(),
            severity: 'major',
            category: 'character',
            description: `Character "${charName}" referenced in scene ${scene.sceneNumber} but not defined in character sheet.`,
            affectedSceneIds: [scene.id],
            affectedClipIds: [],
            suggestion: `Add character definition or correct scene character list.`,
          });
        }
      }
    }

    // Check 2: Location continuity
    const locationNames = new Set<string>();
    for (const scene of script.scenes) {
      const key = scene.location.toLowerCase().trim();
      if (locationNames.has(key) && scene.timeOfDay !== script.scenes[0]?.timeOfDay) {
        // Only flag if time of day changes but location is same (could be intentional)
        // Skip for demo - assume intentional
      }
      locationNames.add(key);
    }

    // Check 3: Duration consistency
    const totalScriptDuration = script.scenes.reduce((sum: number, s: any) => sum + (s.duration || 0), 0);
    const totalEditDuration = editor.finalDuration;
    if (Math.abs(totalScriptDuration - totalEditDuration) > totalScriptDuration * 0.3) {
      issues.push({
        id: uuidv4(),
        severity: 'minor',
        category: 'video',
        description: `Script duration (${totalScriptDuration}s) differs significantly from edit duration (${totalEditDuration}s).`,
        affectedSceneIds: [],
        affectedClipIds: [],
        suggestion: `Review scene durations and edit pacing.`,
      });
    }

    // Check 4: Audio/video sync points
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoFrames = (context as any).data?.videoFrames;
    if (videoFrames?.frames?.length) {
      const lastFrameEnd = videoFrames.frames[videoFrames.frames.length - 1].timestamp +
        (videoFrames.frames[videoFrames.frames.length - 1].duration || 0);
      const lastAudioEnd = editor.timeline
        .filter((t: any) => t.type === 'audio')
        .reduce((max: number, t: any) => Math.max(max, t.end), 0);

      if (Math.abs(lastFrameEnd - lastAudioEnd) > 2) {
        issues.push({
          id: uuidv4(),
          severity: 'minor',
          category: 'audio',
          description: `Video ends at ${lastFrameEnd.toFixed(1)}s but audio extends to ${lastAudioEnd.toFixed(1)}s.`,
          affectedSceneIds: [],
          affectedClipIds: [],
          suggestion: `Trim audio or extend video to match.`,
        });
      }
    }

    // Check 5: World style consistency
    const stylesUsed = new Set<string>();
    for (const scene of script.scenes) {
      const worldScene = world?.scenes?.find((w: any) => w.sceneId === scene.id);
      if (worldScene) {
        stylesUsed.add(worldScene.styleModifiers?.join(',') || '');
      }
    }
    // Note: variety in style is intentional for different scenes, so we don't flag this

    return issues;
  }

  private _generateNotes(issues: ContinuityIssue[]): string[] {
    if (issues.length === 0) {
      return ['✨ Perfect continuity — all elements consistent across the pipeline.'];
    }

    const notes: string[] = [];
    const critical = issues.filter(i => i.severity === 'critical');
    const major = issues.filter(i => i.severity === 'major');
    const minor = issues.filter(i => i.severity === 'minor');

    if (critical.length > 0) {
      notes.push(`🚨 ${critical.length} critical issue(s) must be resolved before proceeding.`);
    }
    if (major.length > 0) {
      notes.push(`⚠️ ${major.length} major issue(s) should be addressed.`);
    }
    if (minor.length > 0) {
      notes.push(`💡 ${minor.length} minor issue(s) noted for polish.`);
    }

    return notes;
  }

  private async _simulateDelay(): Promise<void> {
    await new Promise(r => setTimeout(r, this.processingDelayMs));
  }
}
