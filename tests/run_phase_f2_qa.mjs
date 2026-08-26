import { runPhaseF2QA } from '../qa/run_phase_f2_qa.mjs';

runPhaseF2QA().catch(error => {
  console.error(error);
  process.exit(1);
});
