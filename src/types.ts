/**
 * Stage 12 — types shared by the server-side nutrition adapter.
 *
 * These intentionally mirror the client-side shapes in
 * `src/services/foodNutrition.ts` (mobile app) rather than being imported
 * from there: this server is a separate deployable (own `package.json`,
 * own runtime — plain Node, not React Native/Expo) and is not part of the
 * Expo bundle, so it does not share a build pipeline with the app. Keeping
 * one small, manually-synced type file here is simpler and safer than
 * wiring up a cross-package import between an RN app and a Node service
 * for four small interfaces. If this project grows into a monorepo, these
 * can be extracted into a shared package at that point.
 */

export type FoodUnit = 'adet' | 'gram' | 'ml' | 'porsiyon';

export interface FoodQuery {
  foodName: string;
  quantity: number;
  unit: FoodUnit;
}

/**
 * Where a result's values come from:
 *  - usda-fdc / manufacturer-label: a verified catalog food whose
 *    values are copied from that cited record (see server/src/foods).
 *  - usda-search: an UNVERIFIED free-text fallback — the best USDA search
 *    match for a food that is not in the catalog. Only returned when the
 *    match is unambiguous, and always flagged `verified: false`.
 */
export type FoodNutritionSource = 'usda-fdc' | 'manufacturer-label' | 'usda-search';

export interface FoodNutritionResult {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: FoodNutritionSource;
  /** True for verified catalog foods; false for the free-text USDA search fallback. */
  verified: boolean;
  /** Rough 0–1 confidence in the estimate (1 for verified catalog foods). */
  confidence: number;
  /** Human-readable description of the amount this estimate covers, e.g. "2 adet (100 g)". */
  servingDescription: string;
  /** Human-readable source citation, e.g. "Üretici etiketi · Sütaş ürün etiketi · Sütaş Ayran (100 ml)". */
  sourceNote: string;
}

/**
 * Typed error codes the client's `FoodNutritionError` understands. Every
 * failure path in the provider/handler must map to one of these — never a
 * raw/untyped error reaching the HTTP response body.
 */
export type FoodNutritionErrorCode =
  | 'network_unavailable'
  | 'provider_unavailable'
  | 'food_not_found'
  | 'ambiguous_food'
  | 'unsupported_unit'
  | 'malformed_response'
  | 'server_configuration_error';

export class NutritionLookupError extends Error {
  code: FoodNutritionErrorCode;

  constructor(code: FoodNutritionErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'NutritionLookupError';
  }
}

/** The wire shape returned to the client on a failed lookup. */
export interface NutritionErrorBody {
  error: {
    code: FoodNutritionErrorCode;
    message: string;
  };
}
