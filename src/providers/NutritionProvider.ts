import type { FoodQuery, FoodNutritionResult } from '../types';

/**
 * Stage 12 — the provider abstraction the HTTP handler talks to.
 *
 * Any real nutrition data source (USDA FoodData Central today; Edamam, a
 * commercial food API, or an AI-based estimator later) implements this
 * one method. The handler (`server/src/server.ts`) and the mobile client
 * never depend on a specific provider's request/response shape — only on
 * `FoodQuery` in, `FoodNutritionResult` out, or a typed `NutritionLookupError`
 * thrown. Swapping or adding a provider means writing a new class here,
 * not touching the handler or the app.
 */
export interface NutritionProvider {
  lookup(query: FoodQuery): Promise<FoodNutritionResult>;
}
