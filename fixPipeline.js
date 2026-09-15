import fs from 'fs';
let code = fs.readFileSync('server/jobsWorker.ts', 'utf8');
code = code.replaceAll(
  '      db.updateProject(project.id, { \n        currentStage: \'VIDEO_GENERATION\', \n        pipelineRegenerationCount: (project.pipelineRegenerationCount || 0) + 1 \n      });',
  `      db.updateProject(project.id, { 
        currentStage: 'VIDEO_GENERATION', 
        pipelineRegenerationCount: (project.pipelineRegenerationCount || 0) + 1,
        pipelineCompletedStages: (project.pipelineCompletedStages || []).filter((s: string) => !['VIDEO_GENERATION', 'VOICE', 'SOUND', 'EDITING', 'CONTINUITY', 'QUALITY_CONTROL'].includes(s))
      });`
);
fs.writeFileSync('server/jobsWorker.ts', code);
