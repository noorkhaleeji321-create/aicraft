import dotenv from 'dotenv';
dotenv.config();
if (!process.env.GEMINI_API_KEY) {
  dotenv.config({ path: '.env.example' });
}

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db/index.js';
import { startBackgroundWorker } from './server/jobsWorker.js';
import { generateDialogueTTS } from './server/gemini.js';
import { veoProvider } from './lib/providers/veo.js';
import { ttsProvider } from './lib/providers/tts.js';
import { soundProvider } from './lib/providers/sound.js';
import { runVoiceAgent } from './server/services/voiceAgent.js';
import { runSoundDesignAgent } from './server/services/soundDesignAgent.js';
import { runEditorAgent } from './server/services/editorAgent.js';
import { runContinuityAgent } from './server/services/continuityAgent.js';
import { runQualityControlAgent } from './server/services/qcAgent.js';
import { runProductionMemoryAgent, getAgentContext, recordProductionChange, recordProductionFix } from './server/services/productionMemoryAgent.js';
import { assetStorage } from './lib/storage/index.js';
import { authMiddleware } from './server/middleware/auth.js';
import { externalApiRouter } from './server/routes/externalApi.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Static serving for persistent storage assets
  app.use('/storage', express.static(assetStorage.getStoragePath()));

  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', studio: 'AICraft — Cinematic AI Film & Video Production Studio', db: 'SQLite Relational' });
  });

  // Mount External Hermes Orchestration Router
  app.use('/api/external', externalApiRouter);

  // Projects Events Stream / Poll Endpoint (Requirement 9)
  app.get('/api/projects/:id/events', authMiddleware, (req, res) => {
    const project = db.getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const scenes = db.getScenes(project.id);
    const shots = db.getShots(project.id);
    const completedShots = shots.filter((s) => s.status === 'completed');
    const jobs = db.getJobs(project.id);
    const activeJob = jobs.find((j) => j.status === 'running' || j.status === 'queued');
    const qcReports = db.getQCReports(project.id);

    res.json({
      projectId: project.id,
      stage: project.currentStage,
      overallProgress: project.overallProgress,
      renderStatus: project.renderStatus,
      completedScenes: scenes.filter((s) => s.status === 'completed').length,
      totalScenes: scenes.length,
      completedShots: completedShots.length,
      totalShots: shots.length,
      currentAgent: activeJob ? activeJob.provider : 'MASTER_DIRECTOR',
      activeJob: activeJob || null,
      latestQC: qcReports[0] || null,
      outputVideoUrl: project.outputVideoUrl || null,
      updatedAt: new Date().toISOString()
    });
  });

  // Projects API
  app.get('/api/projects', authMiddleware, (req, res) => {
    res.json(db.getProjects());
  });

  app.get('/api/projects/:id', authMiddleware, (req, res) => {
    const project = db.getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const scenes = db.getScenes(project.id);
    const shots = db.getShots(project.id);
    const characters = db.getCharacters(project.id);
    const locations = db.getLocations(project.id);
    const qcReports = db.getQCReports(project.id);
    const continuityReports = db.getContinuityReports(project.id);
    const jobs = db.getJobs(project.id);

    res.json({
      ...project,
      scenes,
      shots,
      characters,
      locations,
      qcReports,
      continuityReports,
      jobs
    });
  });

  app.post('/api/projects', authMiddleware, (req, res) => {
    const { userPrompt, targetDurationMinutes = 5, genre = 'Cinematic Drama', visualStyle = 'Anamorphic 35mm', aspectRatio = '16:9', provider = 'veo-3.1-lite-generate-preview' } = req.body;

    if (!userPrompt || userPrompt.trim() === '') {
      return res.status(400).json({ error: 'User prompt is required' });
    }

    const estimatedCost = Math.max(200, Math.ceil(targetDurationMinutes * 150));
    const reserved = db.reserveCredits(estimatedCost, `Initial allocation for project: ${userPrompt.slice(0, 30)}...`);

    if (!reserved) {
      return res.status(402).json({ error: 'Insufficient credits in wallet to initiate production.' });
    }

    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const newProject = db.createProject({
      id: projectId,
      name: `Untitled Production (${targetDurationMinutes}m)`,
      description: userPrompt,
      userPrompt,
      genre,
      targetDurationMinutes,
      estimatedDurationSeconds: targetDurationMinutes * 60,
      actualDurationSeconds: 0,
      aspectRatio,
      visualStyle,
      currentStage: 'IDEA',
      overallProgress: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scenesCount: Math.ceil(targetDurationMinutes * 0.6),
      shotsCount: Math.ceil(targetDurationMinutes * 2.4),
      charactersCount: 0,
      locationsCount: 0,
      creditsUsed: 0,
      creditsReserved: estimatedCost,
      renderStatus: 'idle',
      provider
    });

    db.addLog('MASTER_DIRECTOR', 'info', `Created new production project: "${newProject.name}"`, projectId);

    const pipelineJob = db.addJob({
      id: `job_${Date.now()}_pipeline`,
      projectId,
      type: 'MASTER_DIRECTOR_PLAN',
      status: 'queued',
      progress: 0,
      provider: 'Gemini 3.8 Flash',
      costCredits: estimatedCost,
      createdAt: new Date().toISOString()
    });

    res.json({ project: newProject, job: pipelineJob });
  });

  // POST /api/projects/:id/pipeline - Master Pipeline Automation
  app.post('/api/projects/:id/pipeline', authMiddleware, (req, res) => {
    const project = db.getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const startingStage = (!project.currentStage || project.currentStage === 'DELIVERY' || project.currentStage === 'FINAL_RENDER') 
      ? 'IDEA' 
      : project.currentStage;

    db.updateProject(project.id, {
      isAutoPipeline: true,
      pipelineStatus: 'running',
      currentStage: startingStage,
      pipelineCompletedStages: startingStage === 'IDEA' ? [] : (project.pipelineCompletedStages || []),
      pipelineFailedStages: [],
      pipelineRegenerationCount: startingStage === 'IDEA' ? 0 : (project.pipelineRegenerationCount || 0)
    });

    const pipelineJob = db.addJob({
      id: `job_${Date.now()}_master_pipeline`,
      projectId: project.id,
      type: 'MASTER_PIPELINE',
      status: 'queued',
      progress: 0,
      provider: 'AICraft Pipeline Orchestrator',
      costCredits: 0,
      createdAt: new Date().toISOString()
    });

    res.json({ project: db.getProjectById(project.id), job: pipelineJob });
  });

  // POST /api/projects/:id/director - Master Director Agent Endpoint (Requirement 5)
  app.post('/api/projects/:id/director', authMiddleware, (req, res) => {
    const project = db.getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { userPrompt, targetDurationMinutes, genre, visualStyle } = req.body;
    if (userPrompt) project.userPrompt = userPrompt;
    if (targetDurationMinutes) project.targetDurationMinutes = targetDurationMinutes;
    if (genre) project.genre = genre;
    if (visualStyle) project.visualStyle = visualStyle;

    db.updateProject(project.id, {
      userPrompt: project.userPrompt,
      targetDurationMinutes: project.targetDurationMinutes,
      genre: project.genre,
      visualStyle: project.visualStyle,
      currentStage: 'IDEA'
    });

    const cost = 200;
    let reserved = db.reserveCredits(cost, `Master Director plan execution for project ${project.id}`, project.id);
    if (!reserved) {
      db.topupCredits(50000);
      reserved = db.reserveCredits(cost, `Master Director plan execution for project ${project.id}`, project.id);
    }

    const directorJob = db.addJob({
      id: `job_${Date.now()}_director`,
      projectId: project.id,
      type: 'MASTER_DIRECTOR_PLAN',
      status: 'queued',
      progress: 0,
      provider: 'Gemini 3.8 Flash',
      costCredits: cost,
      createdAt: new Date().toISOString()
    });

    db.addLog('MASTER_DIRECTOR', 'info', `Master Director Agent job queued for project "${project.name}"`, project.id);
    res.json({ success: true, message: 'Master Director Agent execution queued', job: directorJob, projectId: project.id });
  });

  // POST /api/projects/:id/script - Script Agent Endpoint
  app.post('/api/projects/:id/script', authMiddleware, (req, res) => {
    const project = db.getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const cost = 200;
    let reserved = db.reserveCredits(cost, `Script Agent screenplay generation for project ${project.id}`, project.id);
    if (!reserved) {
      db.topupCredits(50000);
      reserved = db.reserveCredits(cost, `Script Agent screenplay generation for project ${project.id}`, project.id);
    }

    const scriptJob = db.addJob({
      id: `job_${Date.now()}_script`,
      projectId: project.id,
      type: 'SCRIPT_GEN',
      status: 'queued',
      progress: 0,
      provider: 'Gemini 3.8 Flash',
      costCredits: cost,
      createdAt: new Date().toISOString()
    });

    db.addLog('SCRIPT', 'info', `Script Agent job queued for project "${project.name}"`, project.id);
    res.json({ success: true, message: 'Script Agent execution queued', job: scriptJob, projectId: project.id });
  });

  // POST /api/projects/:id/characters - Character Agent Endpoint
  app.post('/api/projects/:id/characters', authMiddleware, (req, res) => {
    const project = db.getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const cost = 150;
    let reserved = db.reserveCredits(cost, `Character Agent bible generation for project ${project.id}`, project.id);
    if (!reserved) {
      db.topupCredits(50000);
      reserved = db.reserveCredits(cost, `Character Agent bible generation for project ${project.id}`, project.id);
    }

    const charJob = db.addJob({
      id: `job_${Date.now()}_character`,
      projectId: project.id,
      type: 'CHARACTER_GEN',
      status: 'queued',
      progress: 0,
      provider: 'Gemini 3.8 Flash',
      costCredits: cost,
      createdAt: new Date().toISOString()
    });

    db.addLog('CHARACTER', 'info', `Character Agent job queued for project "${project.name}"`, project.id);
    res.json({ success: true, message: 'Character Agent execution queued', job: charJob, projectId: project.id });
  });

  // POST /api/projects/:id/world - World / Environment Agent Endpoint
  app.post('/api/projects/:id/world', authMiddleware, (req, res) => {
    const project = db.getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const cost = 150;
    let reserved = db.reserveCredits(cost, `World Agent location generation for project ${project.id}`, project.id);
    if (!reserved) {
      db.topupCredits(50000);
      reserved = db.reserveCredits(cost, `World Agent location generation for project ${project.id}`, project.id);
    }

    const worldJob = db.addJob({
      id: `job_${Date.now()}_world`,
      projectId: project.id,
      type: 'LOCATION_GEN',
      status: 'queued',
      progress: 0,
      provider: 'Gemini 3.8 Flash',
      costCredits: cost,
      createdAt: new Date().toISOString()
    });

    db.addLog('WORLD', 'info', `World / Environment Agent job queued for project "${project.name}"`, project.id);
    res.json({ success: true, message: 'World Agent execution queued', job: worldJob, projectId: project.id });
  });

  app.post('/api/projects/:id/locations', authMiddleware, (req, res) => {
    res.redirect(307, `/api/projects/${req.params.id}/world`);
  });

  // POST /api/projects/:id/cinematography - Cinematography Agent Endpoint
  app.post('/api/projects/:id/cinematography', authMiddleware, (req, res) => {
    const project = db.getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const cost = 150;
    let reserved = db.reserveCredits(cost, `Cinematography Agent shot plan generation for project ${project.id}`, project.id);
    if (!reserved) {
      db.topupCredits(50000);
      reserved = db.reserveCredits(cost, `Cinematography Agent shot plan generation for project ${project.id}`, project.id);
    }

    const cinJob = db.addJob({
      id: `job_${Date.now()}_cinematography`,
      projectId: project.id,
      type: 'CINEMATOGRAPHY_GEN',
      status: 'queued',
      progress: 0,
      provider: 'Gemini 3.8 Flash',
      costCredits: cost,
      createdAt: new Date().toISOString()
    });

    db.addLog('CINEMATOGRAPHY', 'info', `Cinematography Agent job queued for project "${project.name}"`, project.id);
    res.json({ success: true, message: 'Cinematography Agent execution queued', job: cinJob, projectId: project.id });
  });

  app.post('/api/projects/:id/storyboard', authMiddleware, (req, res) => {
    res.redirect(307, `/api/projects/${req.params.id}/cinematography`);
  });

  app.post('/api/projects/:id/advance-stage', authMiddleware, (req, res) => {
    const project = db.getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const cost = 250;
    let reserved = db.reserveCredits(cost, `Advance stage ${project.currentStage}`, project.id);
    if (!reserved) {
      db.topupCredits(50000);
      reserved = db.reserveCredits(cost, `Advance stage ${project.currentStage}`, project.id);
    }

    const job = db.addJob({
      id: `job_${Date.now()}_stage`,
      projectId: project.id,
      type: 'STAGE_PIPELINE',
      status: 'queued',
      progress: 0,
      provider: 'Gemini 3.8 Flash',
      costCredits: cost,
      createdAt: new Date().toISOString()
    });

    res.json({ message: 'Stage advancement queued', job });
  });

  // POST /api/projects/:id/video-generation - Video Generation Agent Endpoint
  app.post('/api/projects/:id/video-generation', authMiddleware, (req, res) => {
    const project = db.getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const shots = db.getShots(project.id);
    if (shots.length === 0) {
      return res.status(400).json({
        error: 'No cinematography shot plans found for this project. Please run Cinematography Agent first.'
      });
    }

    const { forceAll = false } = req.body;
    const targetShots = forceAll ? shots : shots.filter((s) => s.status !== 'completed');

    if (targetShots.length === 0) {
      return res.json({
        message: 'All shot videos are already generated and completed.',
        shotsCount: shots.length,
        completedCount: shots.length
      });
    }

    const costPerShot = 100;
    const totalCost = targetShots.length * costPerShot;
    const reserved = db.reserveCredits(
      totalCost,
      `Video Generation Agent: ${targetShots.length} shots render for "${project.name}"`,
      project.id
    );

    if (!reserved) {
      return res.status(402).json({
        error: `Insufficient credits in wallet. Required: ${totalCost} CR, Available: ${db.getWallet().available} CR.`
      });
    }

    db.updateProject(project.id, {
      currentStage: 'VIDEO_GENERATION'
    });
    db.updateAgentStatus('VIDEO_GENERATION', 'working');

    const createdJobs = [];
    for (const shot of targetShots) {
      db.updateShot(shot.id, {
        status: 'pending',
        error: undefined,
        providerJobId: undefined
      });

      const shotJob = db.addJob({
        id: `job_shot_veo_${Date.now()}_${shot.id}`,
        projectId: project.id,
        type: 'SHOT_VIDEO_GEN',
        targetId: shot.id,
        provider: project.provider || 'veo-3.1-lite-generate-preview',
        costCredits: costPerShot,
        status: 'queued',
        progress: 0,
        createdAt: new Date().toISOString()
      });
      createdJobs.push(shotJob);
    }

    db.addLog(
      'VIDEO_GENERATION',
      'info',
      `Video Generation Agent initiated for ${targetShots.length} shots in project "${project.name}" using real Veo provider`,
      project.id
    );

    res.json({
      success: true,
      message: `Video Generation Agent queued ${targetShots.length} shots for generation.`,
      projectId: project.id,
      queuedShotsCount: targetShots.length,
      jobs: createdJobs
    });
  });

  app.post('/api/projects/:id/videos', authMiddleware, (req, res) => {
    res.redirect(307, `/api/projects/${req.params.id}/video-generation`);
  });

  // Single Shot Generation / Regeneration
  app.post(['/api/shots/:id/generate', '/api/shots/:id/regenerate'], authMiddleware, (req, res) => {
    const shot = db.getShotById(req.params.id);
    if (!shot) return res.status(404).json({ error: 'Shot not found' });

    const cost = 100;
    const reserved = db.reserveCredits(cost, `Targeted shot video generation: Shot ${shot.shotNumber}`, shot.projectId);
    if (!reserved) {
      return res.status(402).json({ error: 'Insufficient credits in wallet for video generation.' });
    }

    db.updateShot(shot.id, {
      status: 'pending',
      error: undefined,
      providerJobId: undefined
    });

    const project = db.getProjectById(shot.projectId);
    const provider = project?.provider || 'veo-3.1-lite-generate-preview';

    const job = db.addJob({
      id: `job_${Date.now()}_shot_veo_${shot.id}`,
      projectId: shot.projectId,
      type: 'SHOT_VIDEO_GEN',
      targetId: shot.id,
      status: 'queued',
      progress: 0,
      provider,
      costCredits: cost,
      createdAt: new Date().toISOString()
    });

    db.addLog('VIDEO_GENERATION', 'info', `Queued video generation for Shot ${shot.shotNumber} using ${provider}`, shot.projectId);

    // Track fix in production memory
    recordProductionFix(shot.projectId, {
      targetId: shot.id,
      targetType: 'shot',
      action: 'regenerate',
      reason: req.body?.reason || `Shot ${shot.shotNumber} re-rendered`
    }).catch((e) => console.warn('[Memory] Failed to record fix on regenerate:', e));

    res.json({ success: true, message: `Video generation queued for Shot ${shot.shotNumber}`, job, shotId: shot.id });
  });

  app.get('/api/shots/:id', authMiddleware, (req, res) => {
    const shot = db.getShotById(req.params.id);
    if (!shot) return res.status(404).json({ error: 'Shot not found' });
    res.json(shot);
  });

  // Jobs API
  app.get('/api/jobs', authMiddleware, (req, res) => {
    const { projectId } = req.query;
    res.json(db.getJobs(projectId as string));
  });

  app.post('/api/jobs/:id/retry', authMiddleware, (req, res) => {
    const job = db.getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    db.updateJob(job.id, { status: 'queued', progress: 0, error: undefined });
    res.json({ message: 'Job retry queued', job });
  });

  app.post('/api/jobs/:id/cancel', authMiddleware, (req, res) => {
    const job = db.getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    db.updateJob(job.id, { status: 'cancelled' });
    db.refundReservedCredits(job.costCredits, `Refund for cancelled job ${job.id}`, job.id);
    res.json({ message: 'Job cancelled and credits refunded' });
  });

  // Agents & Logs API
  app.get('/api/agents', authMiddleware, (req, res) => {
    res.json(db.getAgents());
  });

  app.get('/api/logs', authMiddleware, (req, res) => {
    const { projectId } = req.query;
    res.json(db.getLogs(projectId as string));
  });

  // Wallet & Credits
  app.get('/api/wallet', authMiddleware, (req, res) => {
    res.json({
      wallet: db.getWallet(),
      transactions: db.getTransactions()
    });
  });

  app.post('/api/wallet/topup', authMiddleware, (req, res) => {
    const amount = req.body.amount || 5000;
    db.topupCredits(amount);
    res.json({ wallet: db.getWallet(), message: `Successfully added ${amount} credits.` });
  });

  // --- VOICE AGENT API ENDPOINTS ---

  // POST /api/projects/:id/voice-generation - Runs the Voice Agent for a project
  app.post(['/api/projects/:id/voice-generation', '/api/projects/:id/voice'], authMiddleware, (req, res) => {
    const project = db.getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const scenes = db.getScenes(project.id);
    if (scenes.length === 0) {
      return res.status(400).json({
        error: 'No screenplay scenes found for this project. Please generate a script first.'
      });
    }

    // Count dialogue lines needing audio
    const { forceAll = false } = req.body;
    let totalLines = 0;
    let pendingLines = 0;
    for (const sc of scenes) {
      for (const dl of sc.dialogue || []) {
        totalLines++;
        if (forceAll || !dl.audioUrl) {
          pendingLines++;
        }
      }
    }

    if (pendingLines === 0 && !forceAll) {
      return res.json({
        message: 'All dialogue voice tracks are already synthesized.',
        totalLines,
        completedLines: totalLines
      });
    }

    const cost = 80;
    const reserved = db.reserveCredits(
      cost,
      `Voice Agent: Synthesizing ${pendingLines} dialogue voice tracks for "${project.name}"`,
      project.id
    );

    if (!reserved) {
      return res.status(402).json({
        error: `Insufficient credits in wallet. Required: ${cost} CR, Available: ${db.getWallet().available} CR.`
      });
    }

    db.updateProject(project.id, { currentStage: 'VOICE' });
    db.updateAgentStatus('VOICE', 'working');

    const voiceJob = db.addJob({
      id: `job_voice_${Date.now()}_${project.id}`,
      projectId: project.id,
      type: 'VOICE_TTS',
      costCredits: cost,
      status: 'queued',
      progress: 0,
      provider: 'gemini-3.1-flash-tts-preview',
      createdAt: new Date().toISOString()
    });

    db.addLog(
      'VOICE',
      'info',
      `Voice Agent queued to synthesize dialogue tracks for ${pendingLines} dialogue lines in "${project.name}"`,
      project.id
    );

    res.json({
      success: true,
      message: `Voice Agent queued to generate ${pendingLines} dialogue tracks`,
      job: voiceJob,
      projectId: project.id,
      pendingLinesCount: pendingLines
    });
  });

  // GET /api/projects/:id/voice-tracks - Retrieve all voice tracks for a project
  app.get('/api/projects/:id/voice-tracks', authMiddleware, (req, res) => {
    const tracks = db.getVoiceTracks(req.params.id);
    res.json(tracks);
  });

  // POST /api/projects/:id/voice/character-voice - Update character assigned voice name
  app.post('/api/projects/:id/voice/character-voice', authMiddleware, (req, res) => {
    const { characterId, voiceName } = req.body;
    if (!characterId || !voiceName) {
      return res.status(400).json({ error: 'characterId and voiceName are required' });
    }

    const characters = db.getCharacters(req.params.id);
    const targetChar = characters.find((c) => c.id === characterId);
    if (!targetChar) {
      return res.status(404).json({ error: 'Character not found' });
    }

    targetChar.voiceName = voiceName;
    db.setCharacters(req.params.id, characters);
    db.addLog('VOICE', 'info', `Assigned voice "${voiceName}" to character "${targetChar.name}"`, req.params.id);

    res.json({ success: true, character: targetChar });
  });

  // POST /api/projects/:id/voice/generate-line - Synthesize a single dialogue line
  app.post('/api/projects/:id/voice/generate-line', authMiddleware, async (req, res) => {
    const { sceneId, dialogueId } = req.body;
    if (!sceneId || !dialogueId) {
      return res.status(400).json({ error: 'sceneId and dialogueId are required' });
    }

    const project = db.getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const scenes = db.getScenes(project.id);
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return res.status(404).json({ error: 'Scene not found' });

    const dialogueLine = scene.dialogue?.find((d) => d.id === dialogueId);
    if (!dialogueLine) return res.status(404).json({ error: 'Dialogue line not found' });

    const characters = db.getCharacters(project.id);
    const matchedChar = characters.find((c) => c.name.toLowerCase() === dialogueLine.character.toLowerCase());
    const voiceName = matchedChar?.voiceName || 'Kore';

    try {
      db.updateAgentStatus('VOICE', 'working');
      const result = await ttsProvider.generateVoiceTrack({
        text: dialogueLine.line,
        voiceName,
        emotion: dialogueLine.voiceTone || scene.emotionalTone,
        fileNamePrefix: `single_voice_sc${scene.sceneNumber}`
      });

      // Update dialogueLine in DB
      dialogueLine.audioUrl = result.url;
      dialogueLine.duration = result.durationSeconds;
      db.updateScene(scene.id, { dialogue: scene.dialogue });

      // Save VoiceTrackRow
      const voiceTrack = db.addVoiceTrack({
        id: `vtrack_${scene.id}_${dialogueLine.id}`,
        projectId: project.id,
        sceneId: scene.id,
        characterId: matchedChar?.id || 'char_unassigned',
        characterName: dialogueLine.character,
        text: dialogueLine.line,
        voiceName,
        audioUrl: result.url,
        durationSeconds: result.durationSeconds,
        status: 'completed',
        createdAt: new Date().toISOString()
      });

      // Register Asset
      db.addAsset({
        id: `asset_voice_${Date.now()}`,
        projectId: project.id,
        type: 'audio',
        name: `Dialogue - ${dialogueLine.character} (Scene ${scene.sceneNumber})`,
        url: result.url,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
        metadataJson: { sceneId: scene.id, dialogueId: dialogueLine.id, voiceName },
        createdAt: new Date().toISOString()
      });

      db.updateAgentStatus('VOICE', 'idle');
      db.addLog('VOICE', 'success', `Synthesized dialogue line for ${dialogueLine.character}: "${dialogueLine.line.slice(0, 30)}..."`, project.id);

      res.json({ success: true, audioUrl: result.url, durationSeconds: result.durationSeconds, voiceTrack });
    } catch (err: any) {
      db.updateAgentStatus('VOICE', 'idle');
      console.error('Error generating single dialogue voice track:', err);
      res.status(500).json({ error: err.message || 'Failed to synthesize dialogue voice track' });
    }
  });

  // TTS Route (Studio Live Tester)
  app.post('/api/tts', authMiddleware, async (req, res) => {
    const { text, voiceName = 'Kore' } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required' });

    try {
      const result = await ttsProvider.generateVoiceTrack({
        text,
        voiceName,
        fileNamePrefix: 'tts_sample'
      });
      res.json({
        audioUrl: result.url,
        durationSeconds: result.durationSeconds,
        mimeType: result.mimeType
      });
    } catch (err: any) {
      console.error('Error generating TTS:', err);
      res.status(500).json({ error: err.message || 'TTS generation failed' });
    }
  });

  // --- SOUND DESIGN AGENT ROUTES ---

  // Trigger Sound Design Agent for project (ambience, foley, action SFX, cinematic layer)
  app.post(['/api/projects/:id/sound-design', '/api/projects/:id/sound'], authMiddleware, async (req, res) => {
    const projectId = req.params.id;
    const { sceneId, shotId, forceRegenerate = false, runAsync = true } = req.body || {};

    const project = db.getProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (runAsync) {
      const cost = 60;
      let reserved = db.reserveCredits(cost, 'Sound Design Agent Generation', projectId);
      if (!reserved) {
        db.topupCredits(50000);
        reserved = db.reserveCredits(cost, 'Sound Design Agent Generation', projectId);
      }

      const job = db.addJob({
        id: `job_sound_${Date.now()}`,
        projectId,
        type: 'SOUND_DESIGN_GEN',
        status: 'queued',
        progress: 0,
        provider: 'gemini-3.1-flash-tts-preview',
        costCredits: cost,
        resultData: { targetSceneId: sceneId, targetShotId: shotId, forceRegenerate },
        createdAt: new Date().toISOString()
      });

      return res.json({
        success: true,
        message: 'Sound Design Agent queued successfully',
        jobId: job.id
      });
    }

    // Direct synchronous generation
    try {
      db.updateAgentStatus('SOUND', 'working');
      db.updateProject(project.id, { currentStage: 'SOUND' });

      const summary = await runSoundDesignAgent({
        projectId,
        sceneId,
        shotId,
        forceRegenerate
      });

      db.updateAgentStatus('SOUND', 'idle');
      res.json({
        success: true,
        summary
      });
    } catch (err: any) {
      db.updateAgentStatus('SOUND', 'idle');
      console.error('Error in direct Sound Design execution:', err);
      res.status(500).json({ error: err.message || 'Sound Design Agent failed to generate audio' });
    }
  });

  // Get all sound tracks / effects for a project
  app.get(['/api/projects/:id/sound-tracks', '/api/projects/:id/sound-effects'], authMiddleware, (req, res) => {
    const projectId = req.params.id;
    const tracks = db.getSoundEffects(projectId);
    res.json(tracks);
  });

  // Generate a single sound effect or ambient track directly
  app.post('/api/projects/:id/sound/generate-sfx', authMiddleware, async (req, res) => {
    const projectId = req.params.id;
    const { prompt, category = 'foley', sceneId, shotId, sceneNumber, shotNumber, durationSeconds = 3.0 } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required for sound effect generation' });
    }

    const project = db.getProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    try {
      db.updateAgentStatus('SOUND', 'working');

      const result = await soundProvider.generateSoundTrack({
        prompt,
        category,
        durationSeconds,
        sceneNumber,
        shotNumber,
        fileNamePrefix: `sfx_${category}`
      });

      const sfxId = `sfx_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const sfxRow = {
        id: sfxId,
        projectId,
        sceneId,
        shotId,
        title: `${category.toUpperCase()}: ${prompt.slice(0, 40)}`,
        category,
        prompt,
        audioUrl: result.url,
        durationSeconds: result.durationSeconds,
        status: 'completed',
        createdAt: new Date().toISOString()
      };

      db.addSoundEffect(sfxRow);

      db.addAsset({
        id: `asset_sfx_${Date.now()}`,
        projectId,
        type: 'audio',
        name: sfxRow.title,
        url: result.url,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
        metadataJson: { category, prompt, sceneId, shotId, durationSeconds: result.durationSeconds },
        createdAt: new Date().toISOString()
      });

      db.updateAgentStatus('SOUND', 'idle');
      res.json({ success: true, soundTrack: sfxRow });
    } catch (err: any) {
      db.updateAgentStatus('SOUND', 'idle');
      console.error('Error generating single sound effect:', err);
      res.status(500).json({ error: err.message || 'Failed to generate sound effect' });
    }
  });

  // Live Sound Preview endpoint (testing sound design prompts)
  app.post('/api/sound-preview', authMiddleware, async (req, res) => {
    const { prompt, category = 'foley' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt required' });

    try {
      const result = await soundProvider.generateSoundTrack({
        prompt,
        category,
        fileNamePrefix: 'preview'
      });
      res.json({
        audioUrl: result.url,
        durationSeconds: result.durationSeconds,
        mimeType: result.mimeType
      });
    } catch (err: any) {
      console.error('Error previewing sound design:', err);
      res.status(500).json({ error: err.message || 'Sound preview generation failed' });
    }
  });

  // --- EDITOR AGENT & TIMELINE ROUTES ---

  // Trigger Editor Agent for project
  app.post(['/api/projects/:id/editor', '/api/projects/:id/editor/run'], authMiddleware, async (req, res) => {
    const projectId = req.params.id;
    const { pacingPreference = 'cinematic_standard', transitionStyle = 'dramatic_cuts', forceRebuild = false, runAsync = true } = req.body || {};

    const project = db.getProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (runAsync) {
      const cost = 50;
      let reserved = db.reserveCredits(cost, 'Editor Agent Timeline Assembly', projectId);
      if (!reserved) {
        db.topupCredits(50000);
        reserved = db.reserveCredits(cost, 'Editor Agent Timeline Assembly', projectId);
      }

      const job = db.addJob({
        id: `job_editor_${Date.now()}`,
        projectId,
        type: 'EDITOR_GEN',
        status: 'queued',
        progress: 0,
        provider: 'AICraft Lead Editor Agent',
        costCredits: cost,
        resultData: { pacingPreference, transitionStyle, forceRebuild },
        createdAt: new Date().toISOString()
      });

      return res.json({
        success: true,
        message: 'Editor Agent job queued successfully',
        jobId: job.id
      });
    }

    // Synchronous execution
    try {
      db.updateAgentStatus('EDITOR', 'working');
      db.updateProject(project.id, { currentStage: 'EDITING' });

      const summary = await runEditorAgent({
        projectId,
        pacingPreference,
        transitionStyle,
        forceRebuild
      });

      db.updateAgentStatus('EDITOR', 'idle');
      const timeline = db.getTimeline(projectId);

      res.json({
        success: true,
        message: 'Editor Agent assembled multi-track timeline successfully',
        summary,
        timeline
      });
    } catch (err: any) {
      db.updateAgentStatus('EDITOR', 'idle');
      console.error('Error running Editor Agent:', err);
      res.status(500).json({ error: err.message || 'Editor Agent execution failed' });
    }
  });

  // GET /api/projects/:id/timeline - Retrieve project timeline (auto-assembles if not yet created)
  app.get('/api/projects/:id/timeline', authMiddleware, async (req, res) => {
    const projectId = req.params.id;
    const project = db.getProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    let timeline = db.getTimeline(projectId);
    if (!timeline) {
      try {
        await runEditorAgent({ projectId });
        timeline = db.getTimeline(projectId);
      } catch (err) {
        console.warn(`Could not auto-generate initial timeline for ${projectId}:`, err);
      }
    }

    res.json(timeline || {
      id: `timeline_${projectId}_empty`,
      projectId,
      totalDurationSeconds: 0,
      fps: 24,
      aspectRatio: project.aspectRatio || '16:9',
      tracks: [],
      sceneOrder: [],
      updatedAt: new Date().toISOString(),
      version: 0
    });
  });

  // PUT /api/projects/:id/timeline - Save entire updated timeline
  app.put('/api/projects/:id/timeline', authMiddleware, (req, res) => {
    const projectId = req.params.id;
    const timelineData = req.body;
    if (!timelineData || !timelineData.tracks) {
      return res.status(400).json({ error: 'Invalid timeline data. tracks array is required.' });
    }

    timelineData.projectId = projectId;
    const saved = db.saveTimeline(timelineData);

    db.addLog(
      'EDITOR',
      'info',
      `Manual timeline edit saved (Version ${saved.version}, ${saved.tracks.length} tracks).`,
      projectId
    );

    res.json({ success: true, timeline: saved });
  });

  // PATCH /api/projects/:id/timeline/clips/:clipId - Update single clip attributes (trim, volume, transitions, fades)
  app.patch('/api/projects/:id/timeline/clips/:clipId', authMiddleware, (req, res) => {
    const { id: projectId, clipId } = req.params;
    const updates = req.body;

    const updated = db.updateTimelineClip(projectId, clipId, updates);
    if (!updated) {
      return res.status(404).json({ error: 'Timeline clip not found' });
    }

    res.json({ success: true, clip: updated });
  });

  // DELETE /api/projects/:id/timeline/clips/:clipId - Delete clip from timeline
  app.delete('/api/projects/:id/timeline/clips/:clipId', authMiddleware, (req, res) => {
    const { id: projectId, clipId } = req.params;
    const deleted = db.deleteTimelineClip(projectId, clipId);
    if (!deleted) {
      return res.status(404).json({ error: 'Timeline clip not found or already removed' });
    }

    res.json({ success: true, message: 'Timeline clip deleted successfully' });
  });

  // POST /api/projects/:id/timeline/reorder - Reorder clips on a specific track
  app.post('/api/projects/:id/timeline/reorder', authMiddleware, (req, res) => {
    const { id: projectId } = req.params;
    const { trackId, orderedItemIds } = req.body;

    if (!trackId || !Array.isArray(orderedItemIds)) {
      return res.status(400).json({ error: 'trackId and orderedItemIds array required' });
    }

    const updatedTimeline = db.reorderTimelineClips(projectId, trackId, orderedItemIds);
    if (!updatedTimeline) {
      return res.status(404).json({ error: 'Track or timeline not found' });
    }

    res.json({ success: true, timeline: updatedTimeline });
  });

  // --- CONTINUITY AGENT ROUTES ---

  // POST /api/projects/:id/continuity - Trigger Continuity Agent check
  app.post(['/api/projects/:id/continuity', '/api/projects/:id/continuity/run'], authMiddleware, async (req, res) => {
    const projectId = req.params.id;
    const { runAsync = true, focusArea = 'all' } = req.body || {};

    const project = db.getProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (runAsync) {
      const cost = 40;
      let reserved = db.reserveCredits(cost, 'Continuity Agent Verification', projectId);
      if (!reserved) {
        db.topupCredits(50000);
        reserved = db.reserveCredits(cost, 'Continuity Agent Verification', projectId);
      }

      const job = db.addJob({
        id: `job_continuity_${Date.now()}`,
        projectId,
        type: 'CONTINUITY_CHECK',
        status: 'queued',
        progress: 0,
        provider: 'AICraft Continuity Supervisor',
        costCredits: cost,
        resultData: { focusArea },
        createdAt: new Date().toISOString()
      });

      return res.json({
        success: true,
        message: 'Continuity Agent job queued successfully',
        jobId: job.id
      });
    }

    // Synchronous execution
    try {
      db.updateAgentStatus('CONTINUITY', 'working');
      const report = await runContinuityAgent({
        projectId,
        focusArea,
        autoSave: true
      });
      db.updateAgentStatus('CONTINUITY', 'idle');

      res.json({
        success: true,
        message: 'Continuity Agent verification completed',
        report
      });
    } catch (err: any) {
      db.updateAgentStatus('CONTINUITY', 'idle');
      console.error('Error running Continuity Agent:', err);
      res.status(500).json({ error: err.message || 'Continuity Agent execution failed' });
    }
  });

  // GET /api/projects/:id/continuity - Get project continuity reports
  app.get('/api/projects/:id/continuity', authMiddleware, (req, res) => {
    const projectId = req.params.id;
    const project = db.getProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const reports = db.getContinuityReports(projectId);
    res.json({ success: true, reports });
  });

  // --- QUALITY CONTROL (QC) AGENT ROUTES ---

  // POST /api/projects/:id/qc - Trigger Quality Control Agent
  app.post(['/api/projects/:id/qc', '/api/projects/:id/qc/run'], authMiddleware, async (req, res) => {
    const projectId = req.params.id;
    const { runAsync = true } = req.body || {};

    const project = db.getProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (runAsync) {
      const cost = 50;
      let reserved = db.reserveCredits(cost, 'Quality Control Inspection', projectId);
      if (!reserved) {
        db.topupCredits(50000);
        reserved = db.reserveCredits(cost, 'Quality Control Inspection', projectId);
      }

      const job = db.addJob({
        id: `job_qc_${Date.now()}`,
        projectId,
        type: 'QC_CHECK',
        status: 'queued',
        progress: 0,
        provider: 'AICraft Quality Control Inspector',
        costCredits: cost,
        createdAt: new Date().toISOString()
      });

      return res.json({
        success: true,
        message: 'Quality Control Agent job queued successfully',
        jobId: job.id
      });
    }

    // Synchronous execution
    try {
      db.updateAgentStatus('QUALITY_CONTROL', 'working');
      const report = await runQualityControlAgent({
        projectId,
        autoSave: true
      });
      db.updateAgentStatus('QUALITY_CONTROL', 'idle');

      res.json({
        success: true,
        message: 'Quality Control inspection completed',
        report
      });
    } catch (err: any) {
      db.updateAgentStatus('QUALITY_CONTROL', 'idle');
      console.error('Error running QC Agent:', err);
      res.status(500).json({ error: err.message || 'Quality Control Agent execution failed' });
    }
  });

  // GET /api/projects/:id/qc - Get project QC reports
  app.get('/api/projects/:id/qc', authMiddleware, (req, res) => {
    const projectId = req.params.id;
    const project = db.getProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const reports = db.getQCReports(projectId);
    res.json({ success: true, reports });
  });

  // --- PRODUCTION MEMORY AGENT ROUTES ---

  // GET /api/projects/:id/memory - Read project memory
  app.get('/api/projects/:id/memory', authMiddleware, async (req, res) => {
    const projectId = req.params.id;
    const project = db.getProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    try {
      let memory = db.getProductionMemory(projectId);
      if (!memory) {
        // Bootstrap initial memory from real project data
        memory = await runProductionMemoryAgent(projectId, {
          triggerReason: 'Initial memory bootstrap'
        });
      }
      res.json({ success: true, memory });
    } catch (err: any) {
      console.error('Error fetching production memory:', err);
      res.status(500).json({ error: err.message || 'Failed to retrieve production memory' });
    }
  });

  // POST /api/projects/:id/memory - Sync or update project memory
  app.post(['/api/projects/:id/memory', '/api/projects/:id/memory/sync'], authMiddleware, async (req, res) => {
    const projectId = req.params.id;
    const { runAsync = true, forceRefresh = false, reason, newDecision, newFix } = req.body || {};

    const project = db.getProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (runAsync) {
      const cost = 25;
      let reserved = db.reserveCredits(cost, 'Production Memory Sync Job', projectId);
      if (!reserved) {
        db.topupCredits(50000);
        reserved = db.reserveCredits(cost, 'Production Memory Sync Job', projectId);
      }

      const job = db.addJob({
        id: `job_mem_${Date.now()}`,
        projectId,
        type: 'PRODUCTION_MEMORY_SYNC',
        status: 'queued',
        progress: 0,
        provider: 'gemini-3.8-flash',
        costCredits: cost,
        resultData: { forceRefresh, reason, newDecision, newFix },
        createdAt: new Date().toISOString()
      });

      db.addLog('PRODUCTION_MEMORY', 'info', `Queued Production Memory sync job (${job.id})`, projectId);
      return res.json({
        success: true,
        message: 'Production Memory sync queued',
        jobId: job.id,
        status: 'queued'
      });
    }

    try {
      db.updateAgentStatus('PRODUCTION_MEMORY', 'working');
      const memory = await runProductionMemoryAgent(projectId, {
        forceRefresh,
        newDecision,
        newFix,
        triggerReason: reason || 'Manual production memory update'
      });
      db.updateAgentStatus('PRODUCTION_MEMORY', 'idle');
      res.json({ success: true, memory });
    } catch (err: any) {
      db.updateAgentStatus('PRODUCTION_MEMORY', 'idle');
      console.error('Error running Production Memory Agent:', err);
      res.status(500).json({ error: err.message || 'Production Memory Agent execution failed' });
    }
  });

  // POST /api/projects/:id/memory/decisions - Add a production decision or rule
  app.post('/api/projects/:id/memory/decisions', authMiddleware, async (req, res) => {
    const projectId = req.params.id;
    const { category, title, description, rationale, appliedByAgent } = req.body || {};

    if (!category || !title || !description) {
      return res.status(400).json({ error: 'category, title, and description are required' });
    }

    try {
      const memory = await recordProductionChange(projectId, {
        category,
        title,
        description,
        rationale,
        appliedByAgent: appliedByAgent || 'DIRECTOR'
      });
      res.json({ success: true, memory });
    } catch (err: any) {
      console.error('Error recording production decision:', err);
      res.status(500).json({ error: err.message || 'Failed to record decision' });
    }
  });

  // POST /api/projects/:id/memory/fixes - Record a critical fix
  app.post('/api/projects/:id/memory/fixes', authMiddleware, async (req, res) => {
    const projectId = req.params.id;
    const { targetId, targetType, action, reason } = req.body || {};

    if (!targetId || !targetType || !action) {
      return res.status(400).json({ error: 'targetId, targetType, and action are required' });
    }

    try {
      const memory = await recordProductionFix(projectId, {
        targetId,
        targetType,
        action,
        reason: reason || 'Defect repair'
      });
      res.json({ success: true, memory });
    } catch (err: any) {
      console.error('Error recording production fix:', err);
      res.status(500).json({ error: err.message || 'Failed to record fix' });
    }
  });

  // GET /api/projects/:id/memory/context/:agentType - Get context tailored for a specific agent
  app.get('/api/projects/:id/memory/context/:agentType', authMiddleware, async (req, res) => {
    const { id, agentType } = req.params;
    const project = db.getProjectById(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    try {
      const context = await getAgentContext(id, agentType as any);
      res.json({ success: true, agentType, context });
    } catch (err: any) {
      console.error('Error retrieving agent context from memory:', err);
      res.status(500).json({ error: err.message || 'Failed to retrieve agent context' });
    }
  });

  // Render final movie timeline
  app.post('/api/render', authMiddleware, (req, res) => {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    const cost = 300;
    let reserved = db.reserveCredits(cost, 'Final render assembly job', projectId);
    if (!reserved) {
      db.topupCredits(50000);
      reserved = db.reserveCredits(cost, 'Final render assembly job', projectId);
    }

    const job = db.addJob({
      id: `job_${Date.now()}_render`,
      projectId,
      type: 'FINAL_RENDER',
      status: 'queued',
      progress: 0,
      provider: 'FFmpeg Timeline Engine',
      costCredits: cost,
      createdAt: new Date().toISOString()
    });

    res.json({ message: 'Final render job queued', job });
  });

  // Veo Direct API endpoints
  app.post('/api/generate-video', authMiddleware, async (req, res) => {
    const { prompt, provider = 'veo-3.1-lite-generate-preview', aspectRatio = '16:9' } = req.body;
    const operationName = await veoProvider.startGeneration({ prompt, provider, aspectRatio });
    res.json({ operationName });
  });

  app.post('/api/video-status', authMiddleware, async (req, res) => {
    const { operationName } = req.body;
    if (!operationName) return res.status(400).json({ error: 'operationName required' });
    const status = await veoProvider.checkStatus(operationName);
    res.json(status);
  });

  app.get('/api/admin/health', authMiddleware, (req, res) => {
    res.json({
      providers: db.getProviders(),
      jobsCount: db.getJobs().length,
      activeWorker: true,
      serverTime: new Date().toISOString()
    });
  });

  // Fallback 404 handler for API routes (prevents Vite/static middleware from returning index.html for unknown /api/* paths)
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  });

  // --- VITE MIDDLEWARE & STATIC SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start background worker loop
  startBackgroundWorker();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AICraft Studio] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
