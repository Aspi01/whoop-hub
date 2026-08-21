import { runCanonicalE21Harness } from '../qa/run_gate_e21_qa.mjs';

runCanonicalE21Harness().catch((err) => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
