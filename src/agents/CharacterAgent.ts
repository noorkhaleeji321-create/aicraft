import { Agent } from './Agent.js';
import {
  PipelineContext,
  PipelineStage,
  CharacterInput,
  CharacterOutput,
  Character,
  Appearance,
  VoiceProfile,
} from '../types/pipeline.js';
import { v4 as uuidv4 } from 'uuid';

export class CharacterAgent extends Agent {
  name = 'CharacterAgent';
  stage: PipelineStage = 'CHARACTER';

  async process(context: PipelineContext): Promise<PipelineContext> {
    const script = context.data.script;
    if (!script) {
      throw new Error('ScriptAgent must run before CharacterAgent — no script data found.');
    }

    const input: CharacterInput = {
      script,
      characterCount: script.sceneCount > 8 ? 4 : 2,
    };

    this._log(context, `🎭 Designing ${input.characterCount} characters for ${script.sceneCount} scenes`, 'info');
    await this._simulateDelay();

    const characters = this._generateCharacters(input.characterCount, script.genre || 'drama');

    const output: CharacterOutput = { characters };

    context.data.characters = output;
    context.currentStage = 'CHARACTER';

    this._log(context, `✅ Created ${characters.length} character profiles`, 'success');
    return context;
  }

  private _generateCharacters(count: number, genre: string): Character[] {
    const archetypes: Array<{
      name: string;
      role: string;
      personality: string;
      appearance: Partial<Appearance>;
      voice: Partial<VoiceProfile>;
    }> = [
      {
        name: 'Aria',
        role: 'Protagonist',
        personality: 'Determined, curious, carries quiet strength beneath a composed exterior. Her journey is one of self-discovery.',
        appearance: { age: 28, gender: 'female', hair: 'dark wavy hair tied back', eyes: 'warm brown', clothing: 'practical travel wear, earth tones' },
        voice: { pitch: 'medium', tone: 'calm and grounded', language: 'en' },
      },
      {
        name: 'Kael',
        role: 'Mentor / Guide',
        personality: 'Wise, sardonic, speaks in riddles that reveal truth only in hindsight. Has seen too much to be easily surprised.',
        appearance: { age: 65, gender: 'male', hair: 'silver, unkempt but intentional', eyes: 'sharp grey', clothing: 'layered coats, worn leather satchel' },
        voice: { pitch: 'low', tone: 'gravelly, measured', language: 'en' },
      },
      {
        name: 'Nyx',
        role: 'Antagonist / Foil',
        personality: 'Charismatic, ruthless in pursuit of what she believes is right. Not evil — just unswerving.',
        appearance: { age: 35, gender: 'female', hair: 'blonde undercut', eyes: 'piercing blue', clothing: 'sharp, tailored, monochrome' },
        voice: { pitch: 'high', tone: 'confident, precise', language: 'en' },
      },
      {
        name: 'Orin',
        role: 'Supporting / Comic Relief',
        personality: 'Optimistic to a fault, loyal to a fault. The heart of any room he enters.',
        appearance: { age: 22, gender: 'male', hair: 'curly brown, perpetually messy', eyes: 'hazel', clothing: 'colorful, layered, practical' },
        voice: { pitch: 'medium', tone: 'bright, rapid', language: 'en' },
      },
    ];

    const selected = archetypes.slice(0, count);
    return selected.map((a, i) => ({
      id: uuidv4(),
      name: a.name,
      role: a.role,
      description: a.personality,
      appearance: {
        age: a.appearance.age!,
        gender: a.appearance.gender!,
        hair: a.appearance.hair,
        eyes: a.appearance.eyes,
        clothing: a.appearance.clothing,
        ethnicity: genre === 'fantasy' ? 'undefined' : 'mixed',
        distinctiveFeatures: i === 0 ? ['a scar across the left eyebrow'] : i === 1 ? ['always carries an old pocket watch'] : [],
      },
      personality: a.personality,
      voiceProfile: {
        pitch: a.voice.pitch!,
        tone: a.voice.tone!,
        language: a.voice.language!,
      } as VoiceProfile,
      assetUrl: `https://assets.aicraft.dev/characters/${a.name.toLowerCase()}.png`,
    }));
  }

  private async _simulateDelay(): Promise<void> {
    await new Promise(r => setTimeout(r, this.processingDelayMs));
  }
}
