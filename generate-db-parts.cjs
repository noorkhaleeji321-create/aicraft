const fs = require('fs');

const src = fs.readFileSync('server/db.ts', 'utf-8');

// match all methods
// public getProjects(): Project[] { ... }
const methodRegex = /public\s+([a-zA-Z0-9_]+)\s*\((.*?)\)(?:\s*:\s*([^\{]+))?\s*\{/g;
let match;
const methods = [];
let currentIndex = 0;

while ((match = methodRegex.exec(src)) !== null) {
  const start = match.index;
  const name = match[1];
  const args = match[2];
  const retType = match[3];
  
  // Find closing brace
  let braceCount = 1;
  let i = start + match[0].length;
  while (braceCount > 0 && i < src.length) {
    if (src[i] === '{') braceCount++;
    else if (src[i] === '}') braceCount--;
    i++;
  }
  
  const body = src.substring(start + match[0].length, i - 1);
  methods.push({ name, args, retType: retType ? retType.trim() : null, body: body, full: src.substring(start, i) });
}

// Group methods manually
const groups = {
  projects: ['getProjects', 'getProjectById', 'createProject', 'updateProject'],
  scenes: ['getScenes', 'createScenes', 'setScenes', 'updateScene'],
  shots: ['getShots', 'getShotById', 'createShots', 'setShots', 'updateShot'],
  characters: ['getCharacters', 'createCharacters', 'setCharacters'],
  locations: ['getLocations', 'createLocations', 'setLocations'],
  jobs: ['getJobs', 'getJobById', 'addJob', 'updateJob', 'addAgentTask', 'getAgentTasks', 'getProviderJobs', 'addProviderJob', 'updateProviderJob'],
  assets: ['getAssets', 'addAsset'],
  audio: ['getVoiceTracks', 'getVoiceTrackById', 'addVoiceTrack', 'updateVoiceTrack', 'setVoiceTracks', 'getSoundEffects', 'getSoundEffectById', 'addSoundEffect', 'updateSoundEffect', 'setSoundEffects', 'getMusicTracks', 'addMusicTrack', 'updateMusicTrack', 'setMusicTracks'],
  wallet: ['getWallet', 'reserveCredits', 'commitReservedCredits', 'refundReservedCredits', 'topupCredits', 'getTransactions'],
  logs: ['getLogs', 'addLog', 'getAgents', 'updateAgentStatus', 'getProviders'],
  reports: ['getQCReports', 'addQCReport', 'getContinuityReports', 'addContinuityReport'],
  timeline: ['getTimeline', 'saveTimeline', 'updateTimelineClip', 'deleteTimelineClip', 'reorderTimelineClips'],
  memory: ['getProductionMemory', 'saveProductionMemory', 'addProductionDecision', 'recordCriticalFix']
};

for (const [groupName, methodNames] of Object.entries(groups)) {
  let code = `import { tables, saveDatabase } from './core.js';\nimport * as types from '../../src/types.js';\nimport * as dbTypes from './types.js';\n\n`;
  for (const name of methodNames) {
    const method = methods.find(m => m.name === name);
    if (!method) continue;
    
    // Convert 'this.tables' to 'tables'
    // Convert 'this.saveDatabase()' to 'saveDatabase()'
    // Remove 'public '
    let funcStr = method.full
      .replace(/public\s+/, 'export function ')
      .replace(/this\.tables/g, 'tables')
      .replace(/this\.saveDatabase\(\)/g, 'saveDatabase()');
    
    // Add prefix to types like Project, Scene, Shot, etc.
    const customTypes = ['Project', 'Scene', 'Shot', 'Character', 'EnvironmentLocation', 'AIJob', 'AgentTask', 'CreditWallet', 'CreditTransaction', 'QCReport', 'ContinuityReport', 'SystemLog', 'AgentInfo', 'ProviderHealth', 'ProjectTimeline', 'TimelineTrack', 'TimelineTrackItem', 'ProductionMemory', 'ProductionDecision', 'CriticalFixRecord'];
    const customDbTypes = ['UserRow', 'AssetRow', 'VoiceTrackRow', 'MusicTrackRow', 'SoundEffectRow', 'TimelineItemRow', 'ProviderJobRow', 'RenderJobRow', 'ProjectEventRow', 'RelationalDatabaseSchema'];
    
    for (const type of customTypes) {
      const regex = new RegExp(`\\b${type}\\b`, 'g');
      funcStr = funcStr.replace(regex, `types.${type}`);
    }
    for (const type of customDbTypes) {
      const regex = new RegExp(`\\b${type}\\b`, 'g');
      funcStr = funcStr.replace(regex, `dbTypes.${type}`);
    }
    
    code += funcStr + '\n\n';
  }
  fs.writeFileSync(`server/db/${groupName}.ts`, code);
}
console.log('Group files generated.');
