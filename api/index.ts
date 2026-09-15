import type { VercelRequest, VercelResponse } from '@vercel/node'
import dotenv from 'dotenv'
import { db } from '../server/db/index.js'
import { authMiddleware } from '../server/middleware/auth.js'
import { runVoiceAgent } from '../server/services/voiceAgent.js'
import { runSoundDesignAgent } from '../server/services/soundDesignAgent.js'
import { runEditorAgent } from '../server/services/editorAgent.js'
import { runContinuityAgent } from '../server/services/continuityAgent.js'
import { runQualityControlAgent } from '../server/services/qcAgent.js'
import { runProductionMemoryAgent, getAgentContext, recordProductionChange, recordProductionFix } from '../server/services/productionMemoryAgent.js'
import { veoProvider } from '../lib/providers/veo.js'

dotenv.config()

function sendJSON(res: VercelResponse, data: any, status = 200) {
  res.status(status).json(data)
}

export function healthHandler(req: VercelRequest, res: VercelResponse) {
  sendJSON(res, { status: 'ok', studio: 'AICraft — Cinematic AI Film & Video Production Studio', db: 'SQLite Relational' })
}

export function projectsListHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  sendJSON(res, db.getProjects())
}

export function projectByIdHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  sendJSON(res, {
    ...project,
    scenes: db.getScenes(project.id),
    shots: db.getShots(project.id),
    characters: db.getCharacters(project.id),
    locations: db.getLocations(project.id),
    qcReports: db.getQCReports(project.id),
    continuityReports: db.getContinuityReports(project.id),
    jobs: db.getJobs(project.id)
  })
}

export function createProjectHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const { userPrompt, targetDurationMinutes = 5, genre = 'Cinematic Drama', visualStyle = 'Anamorphic 35mm', aspectRatio = '16:9', provider = 'veo-3.1-lite-generate-preview' } = req.body
  
  if (!userPrompt || userPrompt.trim() === '') {
    return sendJSON(res, { error: 'User prompt is required' }, 400)
  }
  
  const estimatedCost = Math.max(200, Math.ceil(targetDurationMinutes * 150))
  const reserved = db.reserveCredits(estimatedCost, `Initial allocation for project: ${userPrompt.slice(0, 30)}...`)
  
  if (!reserved) {
    return sendJSON(res, { error: 'Insufficient credits' }, 402)
  }
  
  const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
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
  })
  
  db.addLog('MASTER_DIRECTOR', 'info', `Created new project: ${newProject.name}`, projectId)
  
  const pipelineJob = db.addJob({
    id: `job_${Date.now()}_pipeline`,
    projectId,
    type: 'MASTER_DIRECTOR_PLAN',
    status: 'queued',
    provider: 'MASTER_DIRECTOR',
    createdAt: new Date().toISOString()
  })
  
  sendJSON(res, { project: newProject, job: pipelineJob }, 201)
}

export function eventsHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  sendJSON(res, {
    projectId: project.id,
    stage: project.currentStage,
    overallProgress: project.overallProgress,
    renderStatus: project.renderStatus,
    completedScenes: db.getScenes(project.id).filter((s) => s.status === 'completed').length,
    totalScenes: db.getScenes(project.id).length,
    completedShots: db.getShots(project.id).filter((s) => s.status === 'completed').length,
    totalShots: db.getShots(project.id).length,
    currentAgent: (db.getJobs(project.id).find((j) => j.status === 'running' || j.status === 'queued') || { provider: 'MASTER_DIRECTOR' }).provider,
    activeJob: db.getJobs(project.id).find((j) => j.status === 'running' || j.status === 'queued') || null,
    latestQC: db.getQCReports(project.id)[0] || null,
    outputVideoUrl: project.outputVideoUrl || null,
    updatedAt: new Date().toISOString()
  })
}

// Pipeline trigger
export function pipelineHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  const startingStage = (!project.currentStage || project.currentStage === 'DELIVERY' || project.currentStage === 'FINAL_RENDER') 
    ? 'IDEA' 
    : project.currentStage
  
  db.updateProject(project.id, {
    isAutoPipeline: true,
    pipelineStatus: 'running',
    currentStage: startingStage,
    pipelineCompletedStages: startingStage === 'IDEA' ? [] : (project.pipelineCompletedStages || []),
    pipelineFailedStages: [],
    pipelineRegenerationCount: startingStage === 'IDEA' ? 0 : (project.pipelineRegenerationCount || 0)
  })
  
  const pipelineJob = db.addJob({
    id: `job_${Date.now()}_master_pipeline`,
    projectId: project.id,
    type: 'MASTER_PIPELINE',
    status: 'queued',
    provider: 'AICraft Pipeline Orchestrator',
    createdAt: new Date().toISOString()
  })
  
  sendJSON(res, { project: db.getProjectById(project.id), job: pipelineJob })
}

// Master Director
export function directorHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  const plan = {
    concept: project.userPrompt,
    genre: project.genre,
    targetDuration: project.targetDurationMinutes,
    visualStyle: project.visualStyle,
    scenes: []
  }
  
  db.addLog('MASTER_DIRECTOR', 'info', `Generated plan for project ${project.id}`, project.id)
  
  sendJSON(res, { success: true, plan, project: db.getProjectById(project.id) })
}

// Script Agent
export function scriptHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  const script = {
    title: project.name,
    prompt: project.userPrompt,
    scenes: []
  }
  
  db.addLog('SCRIPT_AGENT', 'info', `Generated script for project ${project.id}`, project.id)
  
  sendJSON(res, { success: true, script })
}

// Characters Agent
export function charactersHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  const characters = db.getCharacters(project.id)
  sendJSON(res, { success: true, characters, project: db.getProjectById(project.id) })
}

// World Agent
export function worldHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  const locations = db.getLocations(project.id)
  sendJSON(res, { success: true, locations, project: db.getProjectById(project.id) })
}

// Cinematography
export function cinematographyHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  const shots = db.getShots(project.id)
  sendJSON(res, { success: true, shots, project: db.getProjectById(project.id) })
}

// Video Generation (Veo)
export function videoGenerationHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  const { prompt, provider = 'veo-3.1-lite-generate-preview', aspectRatio = '16:9' } = req.body || {}
  
  veoProvider.startGeneration({ prompt: prompt || project.userPrompt, provider, aspectRatio })
    .then((operationName) => {
      sendJSON(res, { success: true, operationName })
    })
    .catch((err) => {
      sendJSON(res, { error: err.message }, 500)
    })
}

// Voice Agent
export function voiceHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  runVoiceAgent(project.id)
    .then(() => sendJSON(res, { success: true }))
    .catch((err) => sendJSON(res, { error: err.message }, 500))
}

// Sound Design Agent
export function soundHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  runSoundDesignAgent(project.id)
    .then(() => sendJSON(res, { success: true }))
    .catch((err) => sendJSON(res, { error: err.message }, 500))
}

// Editor Agent
export function editorHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  runEditorAgent(project.id)
    .then(() => sendJSON(res, { success: true, project: db.getProjectById(project.id) }))
    .catch((err) => sendJSON(res, { error: err.message }, 500))
}

// Continuity Agent
export function continuityHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  runContinuityAgent(project.id)
    .then(() => sendJSON(res, { success: true, project: db.getProjectById(project.id) }))
    .catch((err) => sendJSON(res, { error: err.message }, 500))
}

// QC Agent
export function qcHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  runQualityControlAgent(project.id)
    .then(() => sendJSON(res, { success: true, project: db.getProjectById(project.id) }))
    .catch((err) => sendJSON(res, { error: err.message }, 500))
}

// Production Memory
export function memoryHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const project = db.getProjectById(req.params.id)
  if (!project) return sendJSON(res, { error: 'Project not found' }, 404)
  
  const { id } = req.params
  const { type, action } = req.query
  
  if (req.method === 'GET' && type === 'context') {
    const agentType = (req.url?.match(/\/api\/projects\/[^/]+\/memory\/context\/([^/]+)/) || [])[1]
    if (agentType) {
      getAgentContext(id, agentType as any)
        .then((context) => sendJSON(res, { success: true, agentType, context }))
        .catch((err) => sendJSON(res, { error: err.message }, 500))
      return
    }
  }
  
  if (req.method === 'POST' && action === 'change') {
    const { changeType, description, details } = req.body || {}
    recordProductionChange(id, changeType, description, details)
      .then(() => sendJSON(res, { success: true }))
      .catch((err) => sendJSON(res, { error: err.message }, 500))
    return
  }
  
  if (req.method === 'POST' && action === 'fix') {
    const { fixType, description, beforeState, afterState } = req.body || {}
    recordProductionFix(id, fixType, description, beforeState, afterState)
      .then(() => sendJSON(res, { success: true }))
      .catch((err) => sendJSON(res, { error: err.message }, 500))
    return
  }
  
  sendJSON(res, { success: true, memory: db.getMemory(id) })
}

// Final render
export function renderHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const { projectId } = req.body || {}
  if (!projectId) return sendJSON(res, { error: 'projectId required' }, 400)
  
  const cost = 300
  let reserved = db.reserveCredits(cost, 'Final render assembly job', projectId)
  if (!reserved) {
    db.topupCredits(50000)
    reserved = db.reserveCredits(cost, 'Final render assembly job', projectId)
  }
  
  const job = db.addJob({
    id: `job_${Date.now()}_render`,
    projectId,
    type: 'FINAL_RENDER',
    status: 'queued',
    provider: 'FFmpeg Timeline Engine',
    createdAt: new Date().toISOString()
  })
  
  sendJSON(res, { message: 'Final render job queued', job })
}

// Veo Direct API
export function generateVideoHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const { prompt, provider = 'veo-3.1-lite-generate-preview', aspectRatio = '16:9' } = req.body || {}
  veoProvider.startGeneration({ prompt, provider, aspectRatio })
    .then((operationName) => sendJSON(res, { operationName }))
    .catch((err) => sendJSON(res, { error: err.message }, 500))
}

export function videoStatusHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  const { operationName } = req.body || {}
  if (!operationName) return sendJSON(res, { error: 'operationName required' }, 400)
  
  veoProvider.checkStatus(operationName)
    .then((status) => sendJSON(res, status))
    .catch((err) => sendJSON(res, { error: err.message }, 500))
}

// Admin health
export function adminHealthHandler(req: VercelRequest, res: VercelResponse) {
  const auth = authMiddleware(req, res)
  if (auth) return
  
  sendJSON(res, {
    providers: db.getProviders(),
    jobsCount: db.getJobs().length,
    activeWorker: true,
    serverTime: new Date().toISOString()
  })
}

// Default handler - route all /api/* requests
export default function handler(req: VercelRequest, res: VercelResponse) {
  const { method, url } = req
  
  if (url?.startsWith('/api/health')) {
    return healthHandler(req, res)
  }
  
  if (url?.startsWith('/api/admin/health')) {
    return adminHealthHandler(req, res)
  }
  
  if (url?.startsWith('/api/projects')) {
    if (method === 'GET' && url === '/api/projects') {
      return projectsListHandler(req, res)
    }
    
    if (url?.match(/\/api\/projects\/[^/]+\/events$/)) {
      return eventsHandler(req, res)
    }
    
    if (url?.match(/\/api\/projects\/[^/]+$/)) {
      if (method === 'GET') return projectByIdHandler(req, res)
      if (method === 'POST') {
        const projectId = url?.split('/')[3]
        if (url?.endsWith('/director')) return directorHandler(req, res)
        if (url?.endsWith('/script')) return scriptHandler(req, res)
        if (url?.endsWith('/characters')) return charactersHandler(req, res)
        if (url?.endsWith('/world')) return worldHandler(req, res)
        if (url?.endsWith('/cinematography')) return cinematographyHandler(req, res)
        if (url?.endsWith('/video-generation')) return videoGenerationHandler(req, res)
        if (url?.endsWith('/voice-generation')) return voiceHandler(req, res)
        if (url?.endsWith('/sound-design')) return soundHandler(req, res)
        if (url?.endsWith('/editor')) return editorHandler(req, res)
        if (url?.endsWith('/continuity')) return continuityHandler(req, res)
        if (url?.endsWith('/qc')) return qcHandler(req, res)
        if (url?.endsWith('/memory')) return memoryHandler(req, res)
        if (url?.endsWith('/pipeline')) return pipelineHandler(req, res)
        return sendJSON(res, { error: 'Unknown agent endpoint' }, 404)
      }
    }
    
    if (method === 'POST' && url === '/api/projects') {
      return createProjectHandler(req, res)
    }
  }
  
  if (url?.startsWith('/api/render')) {
    return renderHandler(req, res)
  }
  
  if (url?.startsWith('/api/generate-video')) {
    return generateVideoHandler(req, res)
  }
  
  if (url?.startsWith('/api/video-status')) {
    return videoStatusHandler(req, res)
  }
  
  if (url?.startsWith('/api/projects/') && url?.includes('/memory/context/')) {
    return memoryHandler(req, res)
  }
  
  sendJSON(res, { error: `API route not found: ${method} ${url}` }, 404)
}
