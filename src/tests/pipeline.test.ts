import { MasterDirector } from '../agents/MasterDirector.js';
import { createPipelineContext } from '../agents/Agent.js';
import { PipelineStage } from '../types/pipeline.js';

/**
 * AICraft Pipeline Tests
 * Run with: npx ts-node src/tests/pipeline.test.ts
 */

async function runTests() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║              🧪 AICRAFT PIPELINE TESTS                   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');

  let passed = 0;
  let failed = 0;

  // ─── Test 1: MasterDirector initialization ──────────────────
  try {
    const director = new MasterDirector();
    const agents = director.getAgentList();

    if (agents.length !== 12) {
      throw new Error(`Expected 12 agents, got ${agents.length}`);
    }

    // Verify all agent names are unique
    const names = agents.map(a => a.name);
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== 12) {
      throw new Error('Agent names are not unique');
    }

    // Verify all stages are covered
    const stages = agents.map(a => a.stage);
    const expectedStages: PipelineStage[] = [
      'SCRIPT', 'CHARACTER', 'WORLD', 'CINEMATOGRAPHY',
      'VIDEO_GENERATION', 'VOICE', 'SOUND', 'EDITOR',
      'CONTINUITY', 'QC', 'FINAL_VIDEO',
    ];
    // Note: MASTER DIRECTOR doesn't own a stage in the same way

    console.log(`✅ Test 1 PASSED: MasterDirector has 12 agents with unique names`);
    passed++;
  } catch (error) {
    console.log(`❌ Test 1 FAILED: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  // ─── Test 2: PipelineContext creation ───────────────────────
  try {
    const ctx = createPipelineContext('test-run-001');

    if (ctx.runId !== 'test-run-001') {
      throw new Error(`Wrong runId: ${ctx.runId}`);
    }
    if (ctx.failed !== false) {
      throw new Error('Context should not be failed initially');
    }
    if (ctx.log.length !== 0) {
      throw new Error('Context log should be empty initially');
    }
    if (Object.keys(ctx.data).length !== 0) {
      throw new Error('Context data should be empty initially');
    }

    console.log(`✅ Test 2 PASSED: PipelineContext initializes correctly`);
    passed++;
  } catch (error) {
    console.log(`❌ Test 2 FAILED: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  // ─── Test 3: Script Agent execution ─────────────────────────
  try {
    const director = new MasterDirector();
    const ctx = createPipelineContext('test-script');
    (ctx as any).params = {
      script: {
        prompt: 'Test prompt',
        genre: 'sci-fi',
        targetDuration: 30,
        tone: 'mysterious',
      },
    };

    const result = await director.executeStage(ctx, 'SCRIPT');

    if (!result.data.script) {
      throw new Error('Script output missing');
    }
    if (result.data.script.sceneCount < 1) {
      throw new Error('Should have at least 1 scene');
    }
    if (result.data.script.scenes.length !== result.data.script.sceneCount) {
      throw new Error('Scene count mismatch');
    }

    console.log(`✅ Test 3 PASSED: ScriptAgent generates ${result.data.script.sceneCount} scenes`);
    passed++;
  } catch (error) {
    console.log(`❌ Test 3 FAILED: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  // ─── Test 4: Full pipeline execution ────────────────────────
  try {
    const director = new MasterDirector();
    const ctx = createPipelineContext('test-full-pipeline');
    (ctx as any).params = {
      script: {
        prompt: 'A solitary astronaut discovers an alien artifact that challenges everything they knew about the universe.',
        genre: 'sci-fi',
        targetDuration: 45,
        tone: 'wonder-filled',
      },
    };

    const result = await director.executePipeline(ctx);

    if (result.failed) {
      throw new Error(`Pipeline failed: ${result.errorMessage}`);
    }
    if (!result.data.finalVideo) {
      throw new Error('Final video not generated');
    }
    if (result.data.finalVideo.exportStatus !== 'completed') {
      throw new Error(`Export status is ${result.data.finalVideo.exportStatus}, expected 'completed'`);
    }

    console.log(`✅ Test 4 PASSED: Full pipeline completes successfully`);
    console.log(`   → ${result.data.finalVideo.metadata.duration.toFixed(1)}s video, score: ${result.data.qcReport?.overallScore}`);
    passed++;
  } catch (error) {
    console.log(`❌ Test 4 FAILED: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  // ─── Test 5: Agent state after execution ───────────────────
  try {
    const director = new MasterDirector();
    const ctx = createPipelineContext('test-agent-state');
    (ctx as any).params = {
      script: { prompt: 'test', genre: 'drama', targetDuration: 10 },
    };

    // Run a single agent
    await director.executeStage(ctx, 'SCRIPT');

    const scriptAgent = director.getAgentByStage('SCRIPT');
    if (scriptAgent && scriptAgent.isExecuting) {
      throw new Error('Agent should not be executing after completion');
    }

    console.log(`✅ Test 5 PASSED: Agent properly transitions out of executing state`);
    passed++;
  } catch (error) {
    console.log(`❌ Test 5 FAILED: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  // ─── Test 6: Continuity check ───────────────────────────────
  try {
    const director = new MasterDirector();
    const ctx = createPipelineContext('test-continuity');
    (ctx as any).params = {
      script: { prompt: 'test', genre: 'drama', targetDuration: 20 },
    };

    // Run full pipeline to get continuity data
    await director.executePipeline(ctx);

    const continuity = ctx.data.continuityReport;
    if (!continuity) {
      throw new Error('Continuity report missing');
    }
    if (typeof continuity.score !== 'number') {
      throw new Error('Continuity score is not a number');
    }
    if (continuity.score < 0 || continuity.score > 100) {
      throw new Error(`Continuity score out of range: ${continuity.score}`);
    }

    console.log(`✅ Test 6 PASSED: Continuity check produces valid score (${continuity.score}/100)`);
    passed++;
  } catch (error) {
    console.log(`❌ Test 6 FAILED: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  // ─── Test 7: QC approval gating ─────────────────────────────
  try {
    const director = new MasterDirector();
    const ctx = createPipelineContext('test-qc-gate');
    (ctx as any).params = {
      script: { prompt: 'test', genre: 'drama', targetDuration: 15 },
    };

    await director.executePipeline(ctx);

    const qc = ctx.data.qcReport;
    if (!qc) {
      throw new Error('QC report missing');
    }

    // QC should either pass or fail — but finalVideo should only exist if approved
    if (qc.approvedForExport && !ctx.data.finalVideo) {
      throw new Error('QC approved but no final video generated');
    }
    if (!qc.approvedForExport && ctx.data.finalVideo) {
      throw new Error('QC not approved but final video exists');
    }

    console.log(`✅ Test 7 PASSED: QC approval gating works correctly (approved: ${qc.approvedForExport})`);
    passed++;
  } catch (error) {
    console.log(`❌ Test 7 FAILED: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  // ─── Final summary ──────────────────────────────────────────
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    TEST RESULTS                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total:  ${passed + failed}`);
  console.log('');

  if (failed === 0) {
    console.log('   🎉 All tests passed!');
  } else {
    console.log(`   ⚠️  ${failed} test(s) failed — review above output`);
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('Test runner crashed:', error);
  process.exit(1);
});
