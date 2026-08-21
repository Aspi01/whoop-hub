import { runFullE21Harness } from '../qa/run_gate_e21_qa.mjs';

runFullE21Harness().catch(err => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
