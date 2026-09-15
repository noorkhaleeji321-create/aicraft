import { Agent } from './Agent.js';
import {
  PipelineContext,
  PipelineStage,
  WorldInput,
  WorldOutput,
  WorldScene,
} from '../types/pipeline.js';
import { v4 as uuidv4 } from 'uuid';

export class WorldAgent extends Agent {
  name = 'WorldAgent';
  stage: PipelineStage = 'WORLD';

  async process(context: PipelineContext): Promise<PipelineContext> {
    const script = context.data.script;
    const characters = context.data.characters;
    if (!script) throw new Error('ScriptAgent must run before WorldAgent.');
    if (!characters) throw new Error('CharacterAgent must run before WorldAgent.');

    const input: WorldInput = { script, characters };
    this._log(context, `🌍 Building world for ${script.sceneCount} scenes across ${characters.characters.length} characters`, 'info');
    await this._simulateDelay();

    const scenes: WorldScene[] = script.scenes.map((scene, i) => this._buildScene(scene, i));
    const style = this._determineStyle(script);
    const palette = this._generatePalette(style);
    const mood = this._determineMood(script);

    const output: WorldOutput = {
      scenes,
      overallStyle: style,
      colorPalette: palette,
      mood,
    };

    context.data.world = output;
    context.currentStage = 'WORLD';

    this._log(context, `✅ World built: "${style}" style, ${palette.length}-color palette, mood: ${mood}`, 'success');
    return context;
  }

  private _buildScene(scriptScene: any, index: number): WorldScene {
    const locations = [
      { locationType: 'urban', lighting: 'golden hour', weather: 'clear', backgroundElements: ['skyscrapers', 'street-level activity', 'neon signs beginning to glow'], props: ['street lamps', 'café tables', 'bicycles leaning against walls'] },
      { locationType: 'interior', lighting: 'warm practical', weather: undefined, backgroundElements: ['bookshelves', 'window with city view', 'vintage furniture'], props: ['coffee cup', 'notebook', 'candles'] },
      { locationType: 'natural', lighting: 'dappled forest light', weather: 'overcast', backgroundElements: ['tall trees', 'moss-covered stones', 'distant waterfall'], props: ['winding path', 'bird nests', 'fallen leaves'] },
      { locationType: 'industrial', lighting: 'harsh fluorescent', weather: undefined, backgroundElements: ['metal structures', 'pipes', 'concrete walls'], props: ['warning signs', 'tool crates', 'safety rails'] },
      { locationType: 'abstract', lighting: 'ethereal glow', weather: undefined, backgroundElements: ['floating particles', 'geometric shapes', 'color fields'], props: ['beam of light', 'rippling surface', 'portal-like frame'] },
    ];

    const loc = locations[index % locations.length];
    return {
      sceneId: scriptScene.id,
      locationName: this._locationName(scriptScene.location),
      locationType: loc.locationType,
      lighting: loc.lighting,
      weather: loc.weather,
      timeOfDay: scriptScene.timeOfDay,
      backgroundElements: loc.backgroundElements,
      props: loc.props,
      styleModifiers: this._styleModifiers(index),
    };
  }

  private _locationName(location: string): string {
    return location.length > 40 ? location.slice(0, 37) + '...' : location;
  }

  private _styleModifiers(index: number): string[] {
    const modifiers = [
      ['cinematic', 'shallow depth of field', 'lens flare'],
      ['documentary', 'handheld feel', 'natural grain'],
      ['stylized', 'high contrast', 'saturated colors'],
      ['minimalist', 'clean composition', 'negative space'],
      ['atmospheric', 'fog layers', 'soft diffusion'],
    ];
    return modifiers[index % modifiers.length];
  }

  private _determineStyle(script: any): string {
    const genre = script.genre || 'drama';
    const paletteMap: Record<string, string> = {
      drama: 'cinematic realism',
      'sci-fi': 'neo-noir futurism',
      fantasy: 'painterly epic',
      documentary: 'naturalistic vérité',
      comedy: 'bright commercial',
      thriller: 'high contrast noir',
    };
    return paletteMap[genre] || 'cinematic realism';
  }

  private _generatePalette(style: string): string[] {
    const palettes: Record<string, string[]> = {
      'cinematic realism': ['#1a1a2e', '#16213e', '#0f3460', '#e94560', '#f5f5f5'],
      'neo-noir futurism': ['#0d0d0d', '#1a1a2e', '#00d4ff', '#ff006e', '#b8b8b8'],
      'painterly epic': ['#2d1b69', '#4a2c8a', '#d4a574', '#8b5e3c', '#f0e6d3'],
      'naturalistic vérité': ['#8b7355', '#a0896b', '#c4b59a', '#5c4a3a', '#e8dcc8'],
      'bright commercial': ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ffffff'],
      'high contrast noir': ['#0a0a0a', '#2a2a2a', '#5a5a5a', '#cccccc', '#ffffff'],
    };
    return palettes[style] || palettes['cinematic realism'];
  }

  private _determineMood(script: any): string {
    const tone = script.scenes?.[0]?.description?.toLowerCase() || '';
    if (tone.includes('dark') || tone.includes('tense')) return 'tense, foreboding';
    if (tone.includes('bright') || tone.includes('hopeful')) return 'optimistic, warm';
    if (tone.includes('mysterious')) return 'mysterious, atmospheric';
    return 'contemplative, evocative';
  }

  private async _simulateDelay(): Promise<void> {
    await new Promise(r => setTimeout(r, this.processingDelayMs));
  }
}
