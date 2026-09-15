/**
 * AICraft Pipeline - Main Entry Point
 *
 * Usage:
 *   npx ts-node src/index.ts                    # Run full pipeline
 *   npx ts-node src/index.ts --stage SCRIPT    # Run single stage
 *   npx ts-node src/index.ts --prompt "..."    # Custom prompt
 */

import { MasterDirector } from './agents/MasterDirector.js';
import { createPipelineContext } from './agents/Agent.js';
import { PipelineStage } from './types/pipeline.js';

async function main() {
  // Parse command-line args
  const args = process.argv.slice(2);
  const stageArg = args.find(a => a.startsWith('--stage='));
  const promptArg = args.find(a => a.startsWith('--prompt='));
  const genreArg = args.find(a => a.startsWith('--genre='));
  const durationArg = args.find(a => a.startsWith('--duration='));

  const stage = stageArg ? (stageArg.split('=')[1] as PipelineStage) : null;
  const prompt = promptArg ? promptArg.split('=')[1] : 'Create a compelling visual narrative about transformation and human connection.';
  const genre = genreArg ? genreArg.split('=')[1] : 'drama';
  const duration = durationArg ? parseInt(durationArg.split('=')[1], 10) : 60;

  // Create the MasterDirector
  const director = new MasterDirector();

  // Create pipeline context with input parameters
  const context = createPipelineContext();
  (context as any).params = {
    script: {
      prompt,
      genre,
      targetDuration: duration,
      tone: 'inspirational',
    } as any,
  };

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                  🎬 AICRAFT PIPELINE                      ║');
  console.log('║            12-Agent Video Generation System              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`   Prompt: ${prompt}`);
  console.log(`   Genre:  ${genre}`);
  console.log(`   Target: ${duration}s`);
  console.log('');

  const startTime = Date.now();

  try {
    let result: any;

    if (stage) {
      // Run single stage
      console.log(`▶ Running single stage: ${stage}`);
      console.log('');
      result = await director.executeStage(context, stage);
    } else {
      // Run full pipeline
      result = await director.executePipeline(context);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Print summary
    printSummary(result, elapsed);

    // Print full log if pipeline succeeded
    if (!result.failed) {
      printLog(result);
    }

    // Print final video info
    if (result.data.finalVideo) {
      const video = result.data.finalVideo;
      console.log('');
      console.log('📹 FINAL VIDEO');
      console.log(`   URL:       ${video.videoUrl}`);
      console.log(`   Thumbnail: ${video.thumbnailUrl}`);
      console.log(`   Duration:  ${video.metadata.duration.toFixed(1)}s`);
      console.log(`   Resolution: ${video.metadata.resolution}`);
      console.log(`   Frame Rate: ${video.metadata.frameRate}fps`);
      console.log(`   File Size: ${(video.metadata.fileSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Format:    ${video.metadata.format}`);
      console.log(`   Tags:      ${video.metadata.tags.join(', ')}`);
    }
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error('');
    console.error('❌ PIPELINE FAILED');
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`   Duration: ${elapsed}s`);
    process.exit(1);
  }
}

function printSummary(context: any, elapsed: string) {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    PIPELINE SUMMARY                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`   Status:     ${context.failed ? '❌ FAILED' : '✅ SUCCESS'}`);
  console.log(`   Run ID:     ${context.runId}`);
  console.log(`   Duration:   ${elapsed}s`);
  console.log('');

  console.log('   Stage Results:');
  const stages = [
    { stage: 'SCRIPT', key: 'script', label: 'Script' },
    { stage: 'CHARACTER', key: 'characters', label: 'Characters' },
    { stage: 'WORLD', key: 'world', label: 'World' },
    { stage: 'CINEMATOGRAPHY', key: 'cinematography', label: 'Cinematography' },
    { stage: 'VIDEO_GENERATION', key: 'videoFrames', label: 'Video Frames' },
    { stage: 'VOICE', key: 'voiceOver', label: 'Voice Over' },
    { stage: 'SOUND', key: 'soundEffects', label: 'Sound Effects' },
    { stage: 'EDITOR', key: 'editedVideo', label: 'Editor' },
    { stage: 'CONTINUITY', key: 'continuityReport', label: 'Continuity' },
    { stage: 'QC', key: 'qcReport', label: 'QC' },
    { stage: 'FINAL_VIDEO', key: 'finalVideo', label: 'Final Video' },
  ];

  for (const s of stages) {
    const data = context.data[s.key];
    const hasData = data !== undefined;
    const icon = hasData ? '✅' : '⏭️';
    let detail = '';
    if (hasData) {
      if (s.key === 'script') detail = `${data.sceneCount} scenes, ${data.durationEstimate}s`;
      else if (s.key === 'characters') detail = `${data.characters?.length || 0} characters`;
      else if (s.key === 'world') detail = `${data.overallStyle}`;
      else if (s.key === 'cinematography') detail = `${data.shots?.length || 0} shots`;
      else if (s.key === 'videoFrames') detail = `${data.frames?.length || 0} frames, ${data.totalDuration}s`;
      else if (s.key === 'voiceOver') detail = `${data.audioClips?.length || 0} clips, ${data.totalDuration}s`;
      else if (s.key === 'soundEffects') detail = `${data.soundEffects?.length || 0} effects`;
      else if (s.key === 'editedVideo') detail = `${data.timeline?.length || 0} tracks, ${data.finalDuration}s`;
      else if (s.key === 'continuityReport') detail = `score ${data.score}/100, ${data.passed ? 'PASS' : 'FAIL'}`;
      else if (s.key === 'qcReport') detail = `score ${data.overallScore}/100, ${data.approvedForExport ? 'APPROVED' : 'REJECTED'}`;
      else if (s.key === 'finalVideo') detail = `${data.exportStatus}`;
    }
    console.log(`   ${icon} ${s.stage.padEnd(22)} ${detail}`);
  }

  console.log('');
}

function printLog(context: any) {
  const logs = context.log;
  const infoLogs = logs.filter((l: any) => l.level === 'info' && !l.message.startsWith('▶'));
  const successLogs = logs.filter((l: any) => l.level === 'success');
  const errorLogs = logs.filter((l: any) => l.level === 'error');
  const warnLogs = logs.filter((l: any) => l.level === 'warn');

  if (infoLogs.length > 0) {
    console.log('   Info:');
    for (const l of infoLogs) {
      console.log(`      ${l.message}`);
    }
    console.log('');
  }

  if (successLogs.length > 0) {
    console.log('   Success:');
    for (const l of successLogs) {
      console.log(`      ${l.message}`);
    }
    console.log('');
  }

  if (warnLogs.length > 0) {
    console.log('   Warnings:');
    for (const l of warnLogs) {
      console.log(`      ⚠️  ${l.message}`);
    }
    console.log('');
  }

  if (errorLogs.length > 0) {
    console.log('   Errors:');
    for (const l of errorLogs) {
      console.log(`      ❌ ${l.message}`);
    }
    console.log('');
  }
}

// Run
main().catch(console.error);
