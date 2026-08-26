import { runPhaseF21QA } from '../qa/run_phase_f2_qa.mjs';

runPhaseF21QA().catch(error => {
  console.error(error);
  process.exit(1);
});
