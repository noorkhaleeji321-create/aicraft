import { Agent } from './Agent.js';
import {
  PipelineContext,
  PipelineStage,
  CinematographyInput,
  CinematographyOutput,
  Shot,
  ShotType,
  CameraMovement,
  Transition,
  LightingPlan,
} from '../types/pipeline.js';
import { v4 as uuidv4 } from 'uuid';

export class CinematographyAgent extends Agent {
  name = 'CinematographyAgent';
  stage: PipelineStage = 'CINEMATOGRAPHY';

  async process(context: PipelineContext): Promise<PipelineContext> {
    const script = context.data.script;
    const characters = context.data.characters;
    const world = context.data.world;
    if (!script) throw new Error('ScriptAgent must run before CinematographyAgent.');
    if (!characters) throw new Error('CharacterAgent must run before CinematographyAgent.');
    if (!world) throw new Error('WorldAgent must run before CinematographyAgent.');

    this._log(context, `🎬 Planning cinematography for ${script.sceneCount} scenes`, 'info');
    await this._simulateDelay();

    const shots = this._planShots(script, world);
    const cameraAngles = this._planCameraAngles(shots, characters);
    const transitions = this._planTransitions(script);
    const lightingPlan = this._planLighting(world);

    const output: CinematographyOutput = {
      shots,
      cameraAngles,
      transitions,
      lightingPlan,
      aspectRatio: '16:9',
    };

    context.data.cinematography = output;
    context.currentStage = 'CINEMATOGRAPHY';

    this._log(context, `✅ Planned ${shots.length} shots, ${transitions.length} transitions`, 'success');
    return context;
  }

  private _planShots(script: any, world: any): Shot[] {
    const shots: Shot[] = [];
    let shotNumber = 0;

    for (const scene of script.scenes) {
      // Each scene gets 2-4 shots
      const shotCount = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < shotCount; i++) {
        shotNumber++;
        const shot: Shot = {
          id: uuidv4(),
          sceneId: scene.id,
          shotNumber,
          shotType: this._pickShotType(i, shotCount),
          cameraMovement: this._pickMovement(i),
          duration: Math.round(scene.duration / shotCount * (0.8 + Math.random() * 0.4)),
          description: this._shotDescription(scene, i, shotCount),
          focalLength: this._pickFocalLength(),
          depthOfField: i === 0 ? 'shallow' : 'deep',
        };
        shots.push(shot);
      }
    }
    return shots;
  }

  private _pickShotType(shotIndex: number, totalShots: number): ShotType {
    const types: ShotType[] = ['wide', 'medium', 'close-up', 'over-the-shoulder', 'POV'];
    if (shotIndex === 0) return 'wide'; // Establish with wide
    if (shotIndex === totalShots - 1) return 'close-up'; // End with emotion
    return types[1 + Math.floor(Math.random() * (types.length - 2))];
  }

  private _pickMovement(index: number): CameraMovement {
    const movements: CameraMovement[] = ['static', 'pan', 'tilt', 'dolly', 'tracking'];
    return movements[index % movements.length];
  }

  private _pickFocalLength(): string {
    const lengths = ['24mm', '35mm', '50mm', '85mm', '135mm'];
    return lengths[Math.floor(Math.random() * lengths.length)];
  }

  private _shotDescription(scene: any, shotIndex: number, totalShots: number): string {
    const templates = [
      `Establishing ${scene.location} — ${scene.timeOfDay} light fills the frame.`,
      `Character enters frame, ${scene.characters[0] || 'the protagonist'} draws focus.`,
      `Close detail: ${scene.actionDescription.slice(0, 50)}...`,
      `Reaction shot — character absorbs the weight of the moment.`,
      `Dynamic movement through ${scene.location}, following the action.`,
    ];
    return templates[shotIndex % templates.length];
  }

  private _planCameraAngles(shots: Shot[], characters: any): any[] {
    return shots.map(shot => ({
      sceneId: shot.sceneId,
      shotId: shot.id,
      angle: this._pickAngle(shot.shotType),
      description: `Camera positioned to emphasize ${shot.shotType.replace('-', ' ')} composition.`,
    }));
  }

  private _pickAngle(shotType: ShotType): string {
    const angleMap: Record<ShotType, string> = {
      wide: 'eye-level, slightly elevated',
      medium: 'eye-level',
      'close-up': 'slightly below eye-level for intimacy',
      'extreme-close-up': 'direct, unflinching',
      'over-the-shoulder': 'over dominant shoulder, 3/4 profile',
      POV: 'first-person perspective, handheld micro-movements',
      ' Establishing': 'high angle, descending into scene',
      'low-angle': 'from below, looking up — empowers subject',
      'high-angle': 'from above, looking down — vulnerable subject',
      aerial: 'drone or crane, sweeping overview',
    };
    return angleMap[shotType] || 'eye-level';
  }

  private _planTransitions(script: any): Transition[] {
    const transitions: Transition[] = [];
    for (let i = 0; i < script.scenes.length - 1; i++) {
      transitions.push({
        fromScene: script.scenes[i].id,
        toScene: script.scenes[i + 1].id,
        type: this._pickTransitionType(i),
        duration: 0.5 + Math.random() * 1.5,
      });
    }
    return transitions;
  }

  private _pickTransitionType(index: number): Transition['type'] {
    const types: Transition['type'][] = ['cut', 'fade', 'dissolve', 'wipe', 'zoom'];
    // Scene 1->2 often dissolve, climactic transitions more dramatic
    if (index === 0) return 'dissolve';
    if (index === 3) return 'fade';
    return types[Math.floor(Math.random() * types.length)];
  }

  private _planLighting(world: any): LightingPlan {
    return {
      keyLight: world.scenes[0]?.lighting || 'warm directional key from upper left',
      fillLight: 'soft bounce, 1-2 stops below key',
      backLight: 'rim light separating subject from background',
      ambientLight: world.scenes[0]?.weather === 'overcast' ? 'soft ambient fill, no harsh shadows' : 'minimal ambient, controlled spill',
      colorTemperature: '5600K (daylight balanced) with warming gels for interior scenes',
    };
  }

  private async _simulateDelay(): Promise<void> {
    await new Promise(r => setTimeout(r, this.processingDelayMs));
  }
}
