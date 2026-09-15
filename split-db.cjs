const fs = require('fs');
const path = require('path');

const src = fs.readFileSync('server/db.ts', 'utf-8');

// 1. Extract types
const typesMatch = src.match(/export interface UserRow.*?\n\}/s);
const schemaMatch = src.match(/export interface RelationalDatabaseSchema[\s\S]*?\n\}/);

const typesCode = `import {
  Project, Scene, Shot, Character, EnvironmentLocation, AIJob, AgentTask, CreditWallet, CreditTransaction, QCReport, ContinuityReport, SystemLog, AgentInfo, ProviderHealth, ProjectTimeline, TimelineTrack, TimelineTrackItem, ProductionMemory, ProductionDecision, CriticalFixRecord
} from '../../src/types.js';

${typesMatch[0]}

export interface AssetRow {
  id: string;
  projectId: string;
  type: string;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  metadataJson: any;
  createdAt: string;
}
export interface VoiceTrackRow {
  id: string;
  projectId: string;
  sceneId: string;
  shotId?: string;
  characterId: string;
  characterName: string;
  text: string;
  voiceName: string;
  audioUrl: string;
  durationSeconds: number;
  status: string;
  createdAt: string;
}
export interface MusicTrackRow {
  id: string;
  projectId: string;
  title: string;
  mood: string;
  audioUrl: string;
  durationSeconds: number;
  status: string;
  createdAt: string;
}
export interface SoundEffectRow {
  id: string;
  projectId: string;
  sceneId?: string;
  shotId?: string;
  title: string;
  category: string;
  audioUrl: string;
  durationSeconds: number;
  status: string;
  createdAt: string;
}
export interface TimelineItemRow {
  id: string;
  projectId: string;
  trackType: string;
  trackIndex: number;
  itemId: string;
  startTime: number;
  duration: number;
  title: string;
  mediaUrl: string;
  volume: number;
  isMuted: boolean;
  createdAt: string;
}
export interface ProviderJobRow {
  id: string;
  provider: string;
  operationId: string;
  status: string;
  requestPayloadJson: any;
  responseMetadataJson: any;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
export interface RenderJobRow {
  id: string;
  projectId: string;
  status: string;
  progress: number;
  outputVideoUrl?: string;
  durationSeconds?: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
}
export interface ProjectEventRow {
  id: string;
  projectId: string;
  stage: string;
  agentType: string;
  title: string;
  message: string;
  detailsJson?: any;
  timestamp: string;
}

${schemaMatch[0]}
`;
fs.writeFileSync('server/db/types.ts', typesCode);
