import { runSecurityHardeningQA } from '../qa/run_security_hardening_qa.mjs';

runSecurityHardeningQA().catch((err) => {
  console.error('Security hardening QA test entrypoint failed:', err);
  process.exit(1);
});
