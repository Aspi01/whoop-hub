import { APP_KNOWLEDGE, getExactAppHelpAnswer } from '../appKnowledge.js';

export async function getAppHelp(topic) {
  const exact = getExactAppHelpAnswer(topic);
  if (exact) return exact;
  return APP_KNOWLEDGE;
}
