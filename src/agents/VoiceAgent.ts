import { Agent } from './Agent.js';
import {
  PipelineContext,
  PipelineStage,
  VoiceInput,
  VoiceOutput,
  AudioClip,
} from '../types/pipeline.js';
import { v4 as uuidv4 } from 'uuid';

export class VoiceAgent extends Agent {
  name = 'VoiceAgent';
  stage: PipelineStage = 'VOICE';

  async process(context: PipelineContext): Promise<PipelineContext> {
    const script = context.data.script;
    const characters = context.data.characters;
    if (!script) throw new Error('ScriptAgent must run before VoiceAgent.');
    if (!characters) throw new Error('CharacterAgent must run before VoiceAgent.');

    this._log(context, `🎙️ Generating voice-over and character dialogue for ${script.sceneCount} scenes`, 'info');
    await this._simulateDelay();

    const clips = this._generateAudioClips(script, characters);
    const totalDuration = clips.reduce((sum, c) => sum + (c.endTimestamp - c.startTimestamp), 0);

    const output: VoiceOutput = {
      audioClips: clips,
      totalDuration,
      format: 'wav (48kHz, 24-bit)',
    };

    context.data.voiceOver = output;
    context.currentStage = 'VOICE';

    this._log(context, `✅ Generated ${clips.length} audio clips, ${totalDuration.toFixed(1)}s total`, 'success');
    return context;
  }

  private _generateAudioClips(script: any, characters: any): AudioClip[] {
    const clips: AudioClip[] = [];
    let timestamp = 0;

    for (const scene of script.scenes) {
      const sceneCharacters = characters.characters.filter((c: Character) =>
        scene.characters.includes(c.name.toLowerCase())
      );

      // Voice-over narration for each scene
      if (scene.voiceover || script.voiceover) {
        clips.push({
          id: uuidv4(),
          characterId: 'narrator',
          sceneId: scene.id,
          dialogueText: script.voiceover || 'A story unfolds...',
          startTimestamp: timestamp,
          endTimestamp: timestamp + scene.duration * 0.3,
          voiceProfile: { pitch: 'medium', tone: 'warm, authoritative', language: 'en' },
          status: 'generated',
        });
        timestamp += scene.duration * 0.3;
      }

      // Character dialogue
      for (const character of sceneCharacters.length > 0 ? sceneCharacters : characters.characters.slice(0, 1)) {
        for (const dialogue of (scene.dialogue || []).slice(0, 2)) {
          clips.push({
            id: uuidv4(),
            characterId: character.id,
            sceneId: scene.id,
            dialogueText: dialogue,
            startTimestamp: timestamp + 1,
            endTimestamp: timestamp + 1 + 2 + Math.random() * 2,
            voiceProfile: character.voiceProfile || { pitch: 'medium', tone: 'neutral', language: 'en' },
            status: 'generated',
          });
          timestamp += 3 + Math.random() * 2;
        }
      }

      timestamp += scene.duration * 0.2; // pause between scenes
    }

    return clips;
  }

  private async _simulateDelay(): Promise<void> {
    await new Promise(r => setTimeout(r, this.processingDelayMs));
  }
}
