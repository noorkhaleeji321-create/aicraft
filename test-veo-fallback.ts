import fs from 'fs';
import path from 'path';

async function main() {
  console.log("=== Testing Automated Veo 429 Quota Fallback Integration ===");

  // 1. Create a minimal project with the 'force-429' simulation trigger in the user prompt
  const createRes = await fetch('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userPrompt: "A beautiful slow-motion micro shot force-429 green tea steam rising.",
      targetDurationMinutes: 1,
      genre: "Cinematic Documentary",
      visualStyle: "Warm Film Aesthetic"
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error("Failed to create project:", errText);
    process.exit(1);
  }

  const { project } = await createRes.json();
  console.log(`Created Project: ${project.name} (${project.id})`);

  // 2. Trigger Master Pipeline orchestration
  console.log("Triggering Master Production Pipeline...");
  const pipeRes = await fetch(`http://localhost:3000/api/projects/${project.id}/pipeline`, {
    method: 'POST'
  });

  if (!pipeRes.ok) {
    const errText = await pipeRes.text();
    console.error("Failed to trigger pipeline:", errText);
    process.exit(1);
  }

  console.log("Pipeline triggered successfully. Monitoring progress via live endpoints...");

  // 3. Polling monitor loop
  let success = false;
  let attempts = 0;
  const maxAttempts = 30; // 90 seconds of polling

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    attempts++;

    // Fetch live updated project details via HTTP API
    const getRes = await fetch(`http://localhost:3000/api/projects/${project.id}`);
    if (!getRes.ok) {
      console.warn(`Failed to poll project status: ${getRes.status}`);
      continue;
    }

    const freshProj = await getRes.json();
    const currentStage = freshProj.currentStage;
    const pipelineStatus = freshProj.pipelineStatus;
    const overallProgress = freshProj.overallProgress;
    const shots = freshProj.shots || [];
    const completedShots = shots.filter((s: any) => s.status === 'completed');

    console.log(`Stage: [${currentStage}] | Pipeline Status: [${pipelineStatus}] | Progress: [${overallProgress}%] | Shots: ${completedShots.length}/${shots.length}`);

    if (pipelineStatus === 'paused' || pipelineStatus === 'failed') {
      console.error(`\x1b[31m[TEST FAILED]\x1b[0m Pipeline stopped with state: ${pipelineStatus}`);
      const jobs = freshProj.jobs || [];
      console.log("Jobs detail:", jobs.map((j: any) => ({ type: j.type, status: j.status, error: j.error })));
      break;
    }

    // Check if the VIDEO_GENERATION stage was completed via local fallback and the pipeline proceeded to subsequent stages
    const advancedStages = ['VOICE', 'SOUND', 'EDITING', 'DELIVERY', 'QUALITY_CONTROL', 'CONTINUITY'];
    if (advancedStages.includes(currentStage) || pipelineStatus === 'completed' || overallProgress > 70) {
      console.log("\n\x1b[32m[SUCCESS]\x1b[0m The pipeline successfully continued past the Video Generation stage!");

      // Verify fallback shots
      const completedFallbackShot = shots.find((s: any) => s.status === 'completed' && s.videoUrl?.startsWith('/storage/'));
      if (completedFallbackShot && completedFallbackShot.videoUrl) {
        console.log(`\nVerified Fallback Shot details:`);
        console.log(`- Shot ID:   ${completedFallbackShot.id}`);
        console.log(`- Video URL: ${completedFallbackShot.videoUrl}`);
        console.log(`- Error Log: ${completedFallbackShot.error}`);

        const localFileName = path.basename(completedFallbackShot.videoUrl);
        const localFilePath = path.join(process.cwd(), '.data', 'storage', localFileName);

        if (fs.existsSync(localFilePath)) {
          const stats = fs.statSync(localFilePath);
          console.log(`- Local File Size: ${stats.size} bytes`);
          console.log(`- Real Local MP4 exists on disk: \x1b[32mYES\x1b[0m`);
          success = true;
        } else {
          console.error(`\x1b[31m- Local File is missing on disk!\x1b[0m at ${localFilePath}`);
        }
      } else {
        console.error("\x1b[31mNo fallback video URLs found in completed shots!\x1b[0m");
      }
      break;
    }
  }

  if (success) {
    console.log("\n\x1b[32m=== FALLBACK E2E INTEGRATION TEST SUITE PASSED SUCCESSFULLY ===\x1b[0m\n");
    process.exit(0);
  } else {
    console.error("\n\x1b[31m=== FALLBACK E2E INTEGRATION TEST SUITE FAILED ===\x1b[0m\n");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Test suite unhandled exception:", err);
  process.exit(1);
});
