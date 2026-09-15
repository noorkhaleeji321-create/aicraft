import { db } from './server/db/index.js';

async function main() {
  console.log("=== Master Production Pipeline End-to-End Test ===");
  
  // Step 1: Create a minimal test project (1 minute duration)
  const createRes = await fetch('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userPrompt: "A 1-minute documentary showing a beautiful slow-motion close-up of a premium single cup of green tea brewing.",
      targetDurationMinutes: 1,
      genre: "Documentary",
      visualStyle: "Macro Cinematic Cinematic"
    })
  });
  
  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error("Failed to create project:", errText);
    process.exit(1);
  }
  
  const createResult = await createRes.json();
  const project = createResult.project;
  console.log(`Created Project: ${project.name} (${project.id})`);

  // Step 2: Trigger the Master Production Pipeline Orchestrator
  console.log(`Triggering Master Pipeline...`);
  const pipeRes = await fetch(`http://localhost:3000/api/projects/${project.id}/pipeline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!pipeRes.ok) {
    const errText = await pipeRes.text();
    console.error("Failed to trigger pipeline:", errText);
    process.exit(1);
  }

  const pipeResult = await pipeRes.json();
  console.log(`Pipeline Triggered. Active Master Job ID: ${pipeResult.job.id}`);

  // Step 3: Monitor loop (polling status, progress, assets, and errors)
  let done = false;
  let attempts = 0;
  const maxAttempts = 120; // Up to 6 minutes of polling
  const seenJobs = new Map<string, string>();
  const completedStages = new Set<string>();

  console.log("\nMonitoring progress (polling database every 3 seconds)...");

  while (!done && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    attempts++;

    const getRes = await fetch(`http://localhost:3000/api/projects/${project.id}`);
    if (!getRes.ok) {
      console.warn(`Failed to poll project status: ${getRes.status}`);
      continue;
    }

    const projInfo = await getRes.json();
    const currentStage = projInfo.currentStage;
    const pipelineStatus = projInfo.pipelineStatus;
    const overallProgress = projInfo.overallProgress;
    const renderStatus = projInfo.renderStatus;
    const completedList = projInfo.pipelineCompletedStages || [];

    // Log newly completed stages
    for (const stage of completedList) {
      if (!completedStages.has(stage)) {
        completedStages.add(stage);
        console.log(`\x1b[32m[STAGE COMPLETED]\x1b[0m ${stage}`);
      }
    }

    // Log new and updated jobs
    const jobs = projInfo.jobs || [];
    for (const j of jobs) {
      const prevStatus = seenJobs.get(j.id);
      if (!prevStatus) {
        seenJobs.set(j.id, j.status);
        console.log(`[NEW JOB] ${j.type} (${j.id}) - Status: ${j.status}`);
      } else if (prevStatus !== j.status) {
        seenJobs.set(j.id, j.status);
        console.log(`[JOB UPDATE] ${j.type} (${j.id}) - Transitioned from ${prevStatus} to ${j.status}`);
        if (j.status === 'failed') {
          console.error(`\x1b[31m[JOB FAILED]\x1b[0m ${j.type} failed with error: ${j.error}`);
        }
      }
    }

    console.log(`Status -> Stage: \x1b[34m${currentStage}\x1b[0m | Pipeline: ${pipelineStatus} | Progress: ${overallProgress}% | Render: ${renderStatus}`);

    // Stop conditions
    if (pipelineStatus === 'failed' || pipelineStatus === 'paused') {
      console.log(`\n\x1b[31mPipeline stopped with status: ${pipelineStatus}\x1b[0m`);
      const failedJob = jobs.find((j: any) => j.status === 'failed');
      if (failedJob) {
        console.error(`Root Cause Failed Job: ${failedJob.type} (${failedJob.id}) - Error: ${failedJob.error}`);
      }
      break;
    }

    if (currentStage === 'DELIVERY' || renderStatus === 'completed' || pipelineStatus === 'completed') {
      console.log("\n\x1b[32mPipeline E2E Run completed successfully!\x1b[0m");
      done = true;
      break;
    }
  }

  // Step 4: Final output collection
  const finalGetRes = await fetch(`http://localhost:3000/api/projects/${project.id}`);
  const finalProjInfo = await finalGetRes.json();

  console.log("\n" + "=".repeat(50));
  console.log("             FINAL TEST REPORT             ");
  console.log("=".repeat(50));
  console.log(`Project ID:        ${finalProjInfo.id}`);
  console.log(`Project Name:      ${finalProjInfo.name}`);
  console.log(`Pipeline Status:   ${finalProjInfo.pipelineStatus}`);
  console.log(`Overall Progress:  ${finalProjInfo.overallProgress}%`);
  console.log(`Completed Stages:  ${JSON.stringify(finalProjInfo.pipelineCompletedStages)}`);
  console.log(`Failed Stages:     ${JSON.stringify(finalProjInfo.pipelineFailedStages || [])}`);
  console.log(`Regenerations:     ${finalProjInfo.pipelineRegenerationCount}`);
  console.log(`Render Status:     ${finalProjInfo.renderStatus}`);
  console.log(`Output Video URL:  ${finalProjInfo.outputVideoUrl || 'None'}`);
  console.log("=".repeat(50));

  console.log("\nAssets Created:");
  const shots = finalProjInfo.shots || [];
  const sceneList = finalProjInfo.scenes || [];
  
  console.log(`- Scenes generated: ${sceneList.length}`);
  for (const s of sceneList) {
    console.log(`  * Scene ${s.sceneNumber}: "${s.locationName}" (${s.status})`);
  }

  const generatedShots = shots.filter((s: any) => s.videoUrl);
  console.log(`- Videos generated: ${generatedShots.length} / ${shots.length}`);
  for (const s of generatedShots) {
    console.log(`  * Shot ${s.id}: ${s.videoUrl}`);
  }

  if (finalProjInfo.outputVideoUrl) {
    console.log(`- Final Film Compiled: ${finalProjInfo.outputVideoUrl}`);
  } else {
    console.log("- Final compiled film asset is missing.");
  }
}

main().catch(err => {
  console.error("Test execution crashed with unhandled exception:", err);
  process.exit(1);
});
