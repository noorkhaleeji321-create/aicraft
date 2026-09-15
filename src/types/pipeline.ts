/**
 * AICraft Pipeline - Shared Types
 * All agents communicate via typed PipelineData objects
 */

export type PipelineStage =
  | 'SCRIPT'
  | 'CHARACTER'
  | 'WORLD'
  | 'CINEMATOGRAPHY'
  | 'VIDEO_GENERATION'
  | 'VOICE'
  | 'SOUND'
  | 'EDITOR'
  | 'CONTINUITY'
  | 'QC'
  | 'FINAL_VIDEO';

export interface AgentLogEntry {
  id: string;
  agent: string;
  stage: PipelineStage;
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
  timestamp: string;
}

export interface PipelineContext {
  /** Unique pipeline/run ID */
  runId: string;
  /** Current stage being processed */
  currentStage: PipelineStage;
  /** All accumulated data from previous stages */
  data: PipelineData;
  /** Execution logs from all agents */
  log: AgentLogEntry[];
  /** Whether the pipeline has failed */
  failed: boolean;
  /** Error message if failed */
  errorMessage?: string;
}

export interface PipelineData {
  // Script stage
  script?: ScriptOutput;
  // Character stage
  characters?: CharacterOutput;
  // World stage
  world?: WorldOutput;
  // Cinematography stage
  cinematography?: CinematographyOutput;
  // Video generation stage
  videoFrames?: VideoGenerationOutput;
  // Voice stage
  voiceOver?: VoiceOutput;
  // Sound stage
  soundEffects?: SoundOutput;
  // Editor stage
  editedVideo?: EditorOutput;
  // Continuity stage
  continuityReport?: ContinuityOutput;
  // QC stage
  qcReport?: QCOutput;
  // Final video
  finalVideo?: FinalVideoOutput;
}

// ─── Script Agent ───────────────────────────────────────────
export interface ScriptInput {
  prompt: string;
  genre?: string;
  targetDuration?: number; // seconds
  tone?: string;
}

export interface ScriptOutput {
  sceneCount: number;
  scenes: ScriptScene[];
  voiceover?: string;
  durationEstimate: number; // seconds
  genre?: string;
}

export interface ScriptScene {
  id: string;
  sceneNumber: number;
  title: string;
  description: string;
  location: string;
  timeOfDay: string;
  characters: string[]; // character IDs
  actionDescription: string;
  dialogue?: string[];
  duration: number; // seconds per scene
}

// ─── Character Agent ────────────────────────────────────────
export interface CharacterInput {
  script: ScriptOutput;
  characterCount?: number;
}

export interface CharacterOutput {
  characters: Character[];
}

export interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  appearance: Appearance;
  personality: string;
  voiceProfile?: VoiceProfile;
  assetUrl?: string;
}

export interface Appearance {
  age: number;
  gender: string;
  ethnicity?: string;
  hair?: string;
  eyes?: string;
  clothing?: string;
  distinctiveFeatures?: string[];
}

export interface VoiceProfile {
  pitch: 'low' | 'medium' | 'high';
  tone: string;
  accent?: string;
  language: string;
}

// ─── World Agent ────────────────────────────────────────────
export interface WorldInput {
  script: ScriptOutput;
  characters: CharacterOutput;
}

export interface WorldOutput {
  scenes: WorldScene[];
  overallStyle: string;
  colorPalette: string[];
  mood: string;
}

export interface WorldScene {
  sceneId: string;
  locationName: string;
  locationType: string;
  lighting: string;
  weather?: string;
  timeOfDay: string;
  backgroundElements: string[];
  props: string[];
  styleModifiers: string[];
}

// ─── Cinematography Agent ───────────────────────────────────
export interface CinematographyInput {
  script: ScriptOutput;
  characters: CharacterOutput;
  world: WorldOutput;
}

export interface CinematographyOutput {
  shots: Shot[];
  cameraAngles: CameraAngle[];
  transitions: Transition[];
  lightingPlan: LightingPlan;
  aspectRatio: string;
}

export interface Shot {
  id: string;
  sceneId: string;
  shotNumber: number;
  shotType: ShotType;
  cameraMovement: CameraMovement;
  duration: number; // seconds
  description: string;
  focalLength?: string;
  depthOfField?: string;
}

export type ShotType =
  | 'wide'
  | 'medium'
  | 'close-up'
  | 'extreme-close-up'
  | 'over-the-shoulder'
  | 'POV'
  | 'establishing'
  | 'low-angle'
  | 'high-angle'
  | 'aerial';

export type CameraMovement =
  | 'static'
  | 'pan'
  | 'tilt'
  | 'dolly'
  | 'tracking'
  | 'handheld'
  | 'crane'
  | 'zoom';

export interface CameraAngle {
  sceneId: string;
  shotId: string;
  angle: string;
  description: string;
}

export interface Transition {
  fromScene: string;
  toScene: string;
  type: 'cut' | 'fade' | 'dissolve' | 'wipe' | 'zoom';
  duration: number;
}

export interface LightingPlan {
  keyLight: string;
  fillLight: string;
  backLight: string;
  ambientLight: string;
  colorTemperature: string;
}

// ─── Video Generation Agent ─────────────────────────────────
export interface VideoGenerationInput {
  cinematography: CinematographyOutput;
  characters: CharacterOutput;
  world: WorldOutput;
  script: ScriptOutput;
}

export interface VideoGenerationOutput {
  frames: GeneratedFrame[];
  resolution: string;
  frameRate: number;
  totalDuration: number;
  generationStatus: 'pending' | 'in-progress' | 'completed' | 'failed';
}

export interface GeneratedFrame {
  id: string;
  shotId: string;
  sceneId: string;
  frameNumber: number;
  timestamp: number; // seconds
  prompt: string;
  duration?: number; // seconds
  imageUrl?: string;
  videoClipUrl?: string;
  status: 'generated' | 'pending' | 'failed';
  generationTime?: number; // ms
}

// ─── Voice Agent ────────────────────────────────────────────
export interface VoiceInput {
  script: ScriptOutput;
  characters: CharacterOutput;
}

export interface VoiceOutput {
  audioClips: AudioClip[];
  totalDuration: number;
  format: string;
}

export interface AudioClip {
  id: string;
  characterId: string;
  sceneId: string;
  dialogueText: string;
  audioUrl?: string;
  startTimestamp: number;
  endTimestamp: number;
  voiceProfile: VoiceProfile;
  status: 'generated' | 'pending' | 'failed';
}

// ─── Sound Agent ────────────────────────────────────────────
export interface SoundInput {
  script: ScriptOutput;
  cinematography: CinematographyOutput;
  world: WorldOutput;
}

export interface SoundOutput {
  soundEffects: SoundEffect[];
  backgroundMusic?: MusicTrack;
  totalDuration: number;
  audioMix: AudioMix;
}

export interface SoundEffect {
  id: string;
  sceneId: string;
  shotId?: string;
  type: 'foley' | 'sfx' | 'ambiance' | 'transition';
  description: string;
  audioUrl?: string;
  startTimestamp: number;
  endTimestamp: number;
  volume: number; // 0-1
  status: 'generated' | 'pending' | 'failed';
}

export interface MusicTrack {
  id: string;
  mood: string;
  style: string;
  audioUrl?: string;
  startTimestamp: number;
  endTimestamp: number;
  volume: number;
}

export interface AudioMix {
  voiceChannel: number;
  musicChannel: number;
  effectChannel: number;
  masterVolume: number;
}

// ─── Editor Agent ───────────────────────────────────────────
export interface EditorInput {
  videoFrames: VideoGenerationOutput;
  voiceOver: VoiceOutput;
  soundEffects: SoundOutput;
  cinematography: CinematographyOutput;
}

export interface EditorOutput {
  edit: VideoEdit;
  timeline: TimelineEntry[];
  finalDuration: number;
  quality: 'draft' | 'review' | 'final';
}

export interface VideoEdit {
  cuts: EditCut[];
  transitions: Transition[];
  colorGrade?: ColorGrade;
  speedRamps?: SpeedRamp[];
}

export interface EditCut {
  fromClipId: string;
  toClipId: string;
  cutPoint: number; // timestamp in seconds
  reason: string;
}

export interface ColorGrade {
  primary: string;
  secondary?: string;
  lut?: string;
  exposure?: number;
  contrast?: number;
  saturation?: number;
}

export interface SpeedRamp {
  clipId: string;
  startSpeed: number;
  endSpeed: number;
  rampStart: number;
  rampEnd: number;
}

export interface TimelineEntry {
  id: string;
  type: 'video' | 'audio' | 'text' | 'effect';
  track: number;
  start: number;
  end: number;
  sourceId: string;
  layer: number;
}

// ─── Continuity Agent ───────────────────────────────────────
export interface ContinuityInput {
  editor: EditorOutput;
  script: ScriptOutput;
  characters: CharacterOutput;
  world: WorldOutput;
}

export interface ContinuityOutput {
  issues: ContinuityIssue[];
  score: number; // 0-100
  passed: boolean;
  notes: string[];
}

export interface ContinuityIssue {
  id: string;
  severity: 'critical' | 'major' | 'minor';
  category: 'character' | 'world' | 'script' | 'audio' | 'video';
  description: string;
  affectedSceneIds: string[];
  affectedClipIds: string[];
  suggestion?: string;
}

// ─── QC Agent ───────────────────────────────────────────────
export interface QCInput {
  continuity: ContinuityOutput;
  editor: EditorOutput;
  voiceOver: VoiceOutput;
  soundEffects: SoundOutput;
  script: ScriptOutput;
}

export interface QCOutput {
  checks: QCCheck[];
  overallScore: number; // 0-100
  passed: boolean;
  approvedForExport: boolean;
  reviewNotes: string[];
  metadata: QCMetadata;
}

export interface QCCheck {
  id: string;
  category: 'video' | 'audio' | 'content' | 'technical';
  description: string;
  result: 'pass' | 'fail' | 'warn';
  detail?: string;
  timestamp?: number;
}

export interface QCMetadata {
  resolution: string;
  frameRate: number;
  audioSampleRate: number;
  audioBitDepth: number;
  totalDuration: number;
  fileSize?: number;
  format: string;
}

// ─── Final Video Agent ──────────────────────────────────────
export interface FinalVideoInput {
  qc: QCOutput;
  editor: EditorOutput;
  voiceOver: VoiceOutput;
  soundEffects: SoundOutput;
}

export interface FinalVideoOutput {
  videoUrl: string;
  thumbnailUrl?: string;
  metadata: FinalVideoMetadata;
  exportStatus: 'completed' | 'failed' | 'pending';
  exportTimestamp: number;
}

export interface FinalVideoMetadata {
  title: string;
  description?: string;
  duration: number;
  resolution: string;
  frameRate: number;
  fileSize: number;
  format: string;
  tags: string[];
}
