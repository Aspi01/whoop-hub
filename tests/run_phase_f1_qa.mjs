import { runPhaseF1Harness } from '../qa/run_phase_f1_qa.mjs';

runPhaseF1Harness().catch((err) => {
  console.error('Phase F1 QA test entrypoint failed:', err);
  process.exit(1);
});
