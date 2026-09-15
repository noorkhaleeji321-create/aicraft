import fs from 'fs';
import path from 'path';
import { db } from './server/db/index.js';

async function main() {
  console.log("==================================================================");
  console.log("=== STARTING FULL END-TO-END MASTER PIPELINE INTEGRATION TEST ===");
  console.log("==================================================================");

  let projectId = process.argv[2];

  if (projectId) {
    console.log(`\nUsing existing Project ID passed from command-line: ${projectId}`);
    console.log("Jumping straight to Step 4 (Pipeline Integration Assertions)...");
  } else {
    // 1. Create a minimal project with 'force-429' in prompt to trigger fallback rendering
    console.log("\n[Step 1] Creating new cinematic test project via HTTP...");
    const createRes = await fetch('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userPrompt: "A high-tension cybernetic detective in a rain-slicked alleyway force-429.",
        targetDurationMinutes: 1,
        genre: "Cyberpunk Thriller",
        visualStyle: "Anamorphic Neon Teal & Amber"
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("Failed to create project:", errText);
      process.exit(1);
    }

    const { project } = await createRes.json();
    projectId = project.id;
    console.log(`[Success] Created Project: "${project.name}" (ID: ${projectId})`);

    // 2. Trigger the Master Production Pipeline
    console.log("\n[Step 2] Triggering the Master Production Pipeline...");
    const pipeRes = await fetch(`http://localhost:3000/api/projects/${projectId}/pipeline`, {
      method: 'POST'
    });

    if (!pipeRes.ok) {
      const errText = await pipeRes.text();
      console.error("Failed to trigger pipeline:", errText);
      process.exit(1);
    }

    console.log("[Success] Master pipeline successfully triggered. Monitoring progress...");

    // 3. Polling progress until complete
    let attempts = 0;
    const maxAttempts = 50; // Allow up to 150 seconds
    let finalProjectState: any = null;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      attempts++;

      const getRes = await fetch(`http://localhost:3000/api/projects/${projectId}`);
      if (!getRes.ok) {
        console.warn(`Polling failed on attempt ${attempts}: HTTP ${getRes.status}`);
        continue;
      }

      const freshProj = await getRes.json();
      const currentStage = freshProj.currentStage;
      const pipelineStatus = freshProj.pipelineStatus;
      const overallProgress = freshProj.overallProgress;
      const shotsCount = (freshProj.shots || []).length;
      const completedShotsCount = (freshProj.shots || []).filter((s: any) => s.status === 'completed').length;

      console.log(`[Poll #${attempts}] Stage: [${currentStage}] | Status: [${pipelineStatus}] | Progress: [${overallProgress}%] | Shots: ${completedShotsCount}/${shotsCount}`);

      if (pipelineStatus === 'failed') {
        console.error("\x1b[31m[Error] Master Pipeline reported a failure state!\x1b[0m");
        const logs = db.getLogs(projectId);
        console.log("Recent logs from failed pipeline:", logs.slice(-5));
        process.exit(1);
      }

      if (currentStage === 'DELIVERY' && pipelineStatus === 'completed') {
        console.log("\x1b[32m[Success] Master Pipeline completed execution fully!\x1b[0m");
        finalProjectState = freshProj;
        break;
      }
    }

    if (!finalProjectState) {
      console.error("\x1b[31m[Error] Pipeline timed out without reaching the DELIVERY stage!\x1b[0m");
      process.exit(1);
    }
  }

  // 4. Assertions and disk checks
  console.log("\n==================================================================");
  console.log("=== RUNNING RIGOROUS PIPELINE INTEGRATION ASSERTIONS ===");
  console.log("==================================================================");

  // Read fresh database content directly from disk file to bypass separate process caching
  const dbPath = path.join(process.cwd(), '.data', 'aicraft_db.json');
  if (!fs.existsSync(dbPath)) {
    console.error(`\x1b[31m[FAILED] Database file is missing at ${dbPath}\x1b[0m`);
    process.exit(1);
  }

  const rawDbContent = fs.readFileSync(dbPath, 'utf8');
  const freshDb = JSON.parse(rawDbContent);

  const storageDir = path.join(process.cwd(), '.data', 'storage');

  // Verify Fallback Video Assets
  console.log("\n1. Verifying Fallback Shot Video Assets on Disk...");
  const shots = (freshDb.shots || []).filter((s: any) => s.projectId === projectId);
  if (shots.length === 0) {
    console.error("\x1b[31m[FAILED] No shots were created in the database for this project!\x1b[0m");
    process.exit(1);
  }

  for (const shot of shots) {
    if (!shot.videoUrl) {
      console.error(`\x1b[31m[FAILED] Shot ${shot.id} is missing a videoUrl!\x1b[0m`);
      process.exit(1);
    }
    const localVideoPath = path.join(storageDir, path.basename(shot.videoUrl));
    if (!fs.existsSync(localVideoPath)) {
      console.error(`\x1b[31m[FAILED] Local video clip does not exist on disk: ${localVideoPath}\x1b[0m`);
      process.exit(1);
    }
    const stats = fs.statSync(localVideoPath);
    if (stats.size === 0) {
      console.error(`\x1b[31m[FAILED] Local video clip is empty (0 bytes): ${localVideoPath}\x1b[0m`);
      process.exit(1);
    }
    console.log(`- Shot [${shot.id}] -> URL: ${shot.videoUrl} | File Size: ${stats.size} bytes | Status: \x1b[32mOK\x1b[0m`);
  }

  // Verify Real Voice/Audio Tracks
  console.log("\n2. Verifying Spoken Voice Audio Assets...");
  const voiceTracks = (freshDb.voice_tracks || []).filter((v: any) => v.projectId === projectId);
  if (voiceTracks.length === 0) {
    console.log("- No voice tracks needed (silent dialogue script/scene).");
  } else {
    for (const vt of voiceTracks) {
      if (!vt.audioUrl) {
        console.error(`\x1b[31m[FAILED] Voice track ${vt.id} is missing an audioUrl!\x1b[0m`);
        process.exit(1);
      }
      if (vt.audioUrl.startsWith('data:audio/')) {
        console.log(`- Voice Track [${vt.id}] -> Base64 Data URL | Status: \x1b[32mOK\x1b[0m`);
      } else {
        const localAudioPath = path.join(storageDir, path.basename(vt.audioUrl));
        if (!fs.existsSync(localAudioPath)) {
          console.error(`\x1b[31m[FAILED] Local voice track file does not exist on disk: ${localAudioPath}\x1b[0m`);
          process.exit(1);
        }
        const stats = fs.statSync(localAudioPath);
        console.log(`- Voice Track [${vt.id}] -> URL: ${vt.audioUrl} | File Size: ${stats.size} bytes | Status: \x1b[32mOK\x1b[0m`);
      }
    }
  }

  // Verify Sound/Music
  console.log("\n3. Verifying Sound Effects & Music Theme...");
  const soundEffects = (freshDb.sound_effects || []).filter((se: any) => se.projectId === projectId);
  console.log(`- Registered sound effects count: ${soundEffects.length}`);

  // Verify Timeline
  console.log("\n4. Verifying Timeline Track Assembly...");
  const timeline = (freshDb.timelines || []).find((t: any) => t.projectId === projectId);
  if (!timeline || !timeline.tracks || timeline.tracks.length === 0) {
    console.error("\x1b[31m[FAILED] Timeline is missing or has no tracks assembled in database!\x1b[0m");
    process.exit(1);
  }
  console.log(`- Timeline ID: ${timeline.id} | Track Count: ${timeline.tracks.length} | Status: \x1b[32mOK\x1b[0m`);

  // Verify Continuity Report
  console.log("\n5. Verifying Continuity Check Report...");
  const continuityReports = (freshDb.continuity_reports || []).filter((cr: any) => cr.projectId === projectId);
  if (continuityReports.length === 0) {
    console.error("\x1b[31m[FAILED] No continuity report was generated!\x1b[0m");
    process.exit(1);
  }
  const mainContinuity = continuityReports[0];
  console.log(`- Continuity Report ID: ${mainContinuity.id} | Score: ${mainContinuity.score}/100 | Status: ${mainContinuity.status} | Issues: ${mainContinuity.issues?.length || 0} | Status: \x1b[32mOK\x1b[0m`);

  // Verify Quality Control Report
  console.log("\n6. Verifying Technical QC Report...");
  const qcReports = (freshDb.qc_reports || []).filter((qr: any) => qr.projectId === projectId);
  if (qcReports.length === 0) {
    console.error("\x1b[31m[FAILED] No Quality Control report was generated!\x1b[0m");
    process.exit(1);
  }
  const mainQC = qcReports[0];
  console.log(`- QC Report ID: ${mainQC.id} | Score: ${mainQC.score}/100 | Status: ${mainQC.overallStatus} | Defect Count: ${mainQC.issues?.length || 0} | Status: \x1b[32mOK\x1b[0m`);

  // Verify Final Master MP4 Render on Disk & DB Registration
  console.log("\n7. Verifying Master Video Render Asset...");
  const finalProject = (freshDb.projects || []).find((p: any) => p.id === projectId);
  if (!finalProject?.outputVideoUrl) {
    console.error("\x1b[31m[FAILED] Final rendered video is not registered in the database project record!\x1b[0m");
    process.exit(1);
  }

  const finalRenderPath = path.join(storageDir, path.basename(finalProject.outputVideoUrl));
  if (!fs.existsSync(finalRenderPath)) {
    console.error(`\x1b[31m[FAILED] Final rendered video does not exist on disk at: ${finalRenderPath}\x1b[0m`);
    process.exit(1);
  }

  const finalStats = fs.statSync(finalRenderPath);
  if (finalStats.size === 0) {
    console.error(`\x1b[31m[FAILED] Final rendered video file is empty (0 bytes)!\x1b[0m`);
    process.exit(1);
  }

  console.log(`- Database Registered Output URL: ${finalProject.outputVideoUrl}`);
  console.log(`- Physical Disk File Path:        ${finalRenderPath}`);
  console.log(`- Final Compiled MP4 Size:        ${finalStats.size} bytes`);
  console.log(`- Master Render Validation Status: \x1b[32mSUCCESSFUL (REAL LOCAL MP4 INSTANTIATED)\x1b[0m`);

  console.log("\n==================================================================");
  console.log("=== SUCCESS: ALL PIPELINE INTEGRATION CRITERIA VERIFIED GREEN ===");
  console.log("==================================================================");
  process.exit(0);
}

main().catch(err => {
  console.error("Pipeline test suite unhandled exception:", err);
  process.exit(1);
});
