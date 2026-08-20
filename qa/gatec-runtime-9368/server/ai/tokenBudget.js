export const TOKEN_BUDGETS = {
  OUT_OF_SCOPE: { maxInput: 0, maxOutput: 0 },
  APP_HELP: { maxInput: 400, maxOutput: 300 },
  USER_DATA: { maxInput: 600, maxOutput: 350 },
  TRAINING: { maxInput: 1200, maxOutput: 500 },
  NUTRITION: { maxInput: 1000, maxOutput: 450 },
  HEALTH: { maxInput: 1000, maxOutput: 450 },
  SPORTS_PRODUCTS: { maxInput: 600, maxOutput: 350 }
};

export function logLatencyMetrics({ intent, route_ms, context_ms, llm_ms, total_ms, model, tokens_used }) {
  console.log(`[AI Performance] intent=${intent} | route=${route_ms}ms | context=${context_ms}ms | llm=${llm_ms}ms | total=${total_ms}ms | model=${model || 'direct'}`);
}
