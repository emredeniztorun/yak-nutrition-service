import type { NutritionProvider } from './NutritionProvider';
import type { FoodQuery, FoodNutritionResult } from '../types';
import { NutritionLookupError } from '../types';

/**
 * USDA FoodData Central — FREE-TEXT FALLBACK ONLY.
 *
 * Predefined foods never reach this class: they are answered from the
 * verified catalog (server/src/foods). This provider only handles a name
 * the catalog does not know, and it is deliberately strict — it returns a
 * result ONLY when USDA has an unambiguous, clearly matching record, and
 * otherwise reports food_not_found ("Besin bulunamadı") rather than
 * guessing. Results are always flagged `verified: false`.
 *
 * Reliability rules (all must hold):
 *  0. Generic foods only — branded/restaurant records (ALL-CAPS brand
 *     names) are skipped, and Greek/strained yogurt is never returned.
 *  1. Every meaningful word the user typed appears as a whole word in the
 *     USDA description (so "apple pie" can match "Pie, apple", but "elma"
 *     or "kebap" never silently match some unrelated English record).
 *  2. The record has complete calorie/protein/carb/fat data that is
 *     physically plausible (macros ≤ 100 g per 100 g, energy consistent
 *     with 4/4/9 kcal per gram within a tolerance).
 *  3. The best match is clearly better than the runner-up; if two
 *     equally good matches disagree on calories by more than 15 %, the
 *     query is ambiguous and nothing is returned.
 *  4. Only grams are supported: without a verified serving definition
 *     there is no trustworthy meaning for "1 adet", "1 porsiyon" or "ml",
 *     and USDA's household-portion metadata is not used to invent one.
 */

const FDC_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const NUTRIENT_ENERGY = [1008, 2048, 2047];
const NUTRIENT_PROTEIN = 1003;
const NUTRIENT_CARBS = 1005;
const NUTRIENT_FAT = 1004;

// Generic English filler words that carry no identity for a food.
const STOP_WORDS = new Set(['and', 'with', 'the', 'raw', 'fresh', 'plain', 'food', 'foods']);

// Turkish words that are also English food words but mean something else
// in Turkish — matching them against an English database would silently
// return the wrong food (e.g. Turkish "pasta" is cake, not "Pasta, cooked").
const TURKISH_FALSE_FRIENDS = new Set(['pasta']);

// Product policy: Greek / Greek-style (strained) yogurt is excluded from YAK
// entirely — it is never offered, whether typed or matched.
const EXCLUDED_WORDS = new Set(['greek', 'suzme', 'strained']);

/**
 * USDA marks branded/restaurant records with an ALL-CAPS brand name
 * (e.g. "Yogurt, Greek, Blueberry, CHOBANI", "APPLEBEE'S, french fries").
 * Those describe one company's product, not the generic food someone typed,
 * so the fallback only accepts generic records.
 */
// USDA's own upper-case abbreviations, which are not brand names.
const USDA_ABBREVIATIONS = new Set(['NFS', 'RTE', 'UHT', 'USDA', 'NLEA', 'BBQ', 'DHA', 'PKU']);

function isBrandedDescription(description: string): boolean {
  return description.split(/[\s,]+/).some((token) => {
    const letters = token.replace(/[^A-Za-z]/g, '');
    return letters.length >= 3 && letters === letters.toUpperCase() && !USDA_ABBREVIATIONS.has(letters);
  });
}

interface FdcSearchFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients?: Array<{ nutrientId?: number; value?: number }>;
}

interface FdcSearchResponse {
  foods?: FdcSearchFood[];
}

interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * USDA FDC sits behind an nginx edge that occasionally returns a bare HTML
 * 4xx/5xx page on a reused connection (verified: the same valid URL gave
 * 200/200/200/400/400/200). A genuine API error is always JSON, so only
 * the non-JSON gateway glitch is retried.
 */
async function fdcFetch<T>(path: string, apiKey: string): Promise<T> {
  const url = `${FDC_BASE_URL}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      if (attempt < 2) {
        await delay(250 * (attempt + 1));
        continue;
      }
      throw new NutritionLookupError('network_unavailable', 'Could not reach USDA FoodData Central.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new NutritionLookupError('server_configuration_error', 'USDA FDC API key was rejected.');
    }
    if (response.status === 429) {
      throw new NutritionLookupError('provider_unavailable', 'USDA FDC rate limit was exceeded.');
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (!body.trim().startsWith('{') && attempt < 2) {
        await delay(250 * (attempt + 1));
        continue;
      }
      throw new NutritionLookupError('provider_unavailable', `USDA FDC returned HTTP ${response.status}.`);
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new NutritionLookupError('malformed_response', 'USDA FDC response was not valid JSON.');
    }
  }
  throw new NutritionLookupError('provider_unavailable', 'USDA FDC request failed after retries.');
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9%]+/)
    .filter(Boolean);
}

/** A description word matches a query word exactly or as its simple plural. */
function hasWord(descriptionWords: string[], word: string): boolean {
  return descriptionWords.some((w) => w === word || w === `${word}s` || w === `${word}es` || `${w}s` === word);
}

function macrosOf(food: FdcSearchFood): Macros | null {
  const values = new Map<number, number>();
  for (const n of food.foodNutrients ?? []) {
    if (typeof n.nutrientId === 'number' && typeof n.value === 'number' && Number.isFinite(n.value)) {
      values.set(n.nutrientId, n.value);
    }
  }
  const calories = NUTRIENT_ENERGY.map((id) => values.get(id)).find((v) => v !== undefined);
  const protein = values.get(NUTRIENT_PROTEIN);
  const carbs = values.get(NUTRIENT_CARBS);
  const fat = values.get(NUTRIENT_FAT);
  if (calories === undefined || protein === undefined || carbs === undefined || fat === undefined) return null;
  return { calories, protein, carbs, fat };
}

function isPlausible(m: Macros): boolean {
  if ([m.calories, m.protein, m.carbs, m.fat].some((v) => v < 0)) return false;
  if (m.calories > 902 || m.protein + m.carbs + m.fat > 102) return false;
  const atwater = 4 * m.protein + 4 * m.carbs + 9 * m.fat;
  return Math.abs(atwater - m.calories) <= Math.max(30, 0.3 * m.calories);
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export class UsdaFoodDataCentralProvider implements NutritionProvider {
  constructor(private readonly apiKey: string) {}

  async lookup(query: FoodQuery): Promise<FoodNutritionResult> {
    const name = query.foodName.trim();
    const queryWords = words(name).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

    if (
      queryWords.length === 0 ||
      queryWords.some((w) => TURKISH_FALSE_FRIENDS.has(w) || EXCLUDED_WORDS.has(w))
    ) {
      throw new NutritionLookupError('food_not_found', `No reliable USDA match for "${name}".`);
    }

    if (query.unit !== 'gram') {
      throw new NutritionLookupError(
        'unsupported_unit',
        `"${name}" is not a verified catalog food; only grams are supported for unverified results.`,
      );
    }

    const dataTypes = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'].map(encodeURIComponent).join(',');
    const search = await fdcFetch<FdcSearchResponse>(
      `/foods/search?query=${encodeURIComponent(name)}&pageSize=25&dataType=${dataTypes}`,
      this.apiKey,
    );

    const candidates: Array<{ food: FdcSearchFood; macros: Macros; score: number }> = [];
    for (const food of search.foods ?? []) {
      const descriptionWords = words(food.description);
      if (!queryWords.every((w) => hasWord(descriptionWords, w))) continue;
      if (isBrandedDescription(food.description)) continue;
      if (descriptionWords.some((w) => EXCLUDED_WORDS.has(w))) continue;
      const macros = macrosOf(food);
      if (!macros || !isPlausible(macros)) continue;
      // Fewer extra words = a more specific, closer match.
      const extraWords = descriptionWords.length - queryWords.length;
      const datasetBonus = food.dataType === 'Foundation' || food.dataType === 'SR Legacy' ? 1 : 0;
      candidates.push({ food, macros, score: 100 - extraWords * 2 + datasetBonus });
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best) {
      throw new NutritionLookupError('food_not_found', `No reliable USDA match for "${name}".`);
    }

    const runnerUp = candidates[1];
    if (runnerUp && runnerUp.score === best.score) {
      const spread = Math.abs(runnerUp.macros.calories - best.macros.calories) / Math.max(best.macros.calories, 1);
      if (spread > 0.15) {
        // Ambiguous → treated as not found rather than picking one.
        throw new NutritionLookupError('food_not_found', `USDA match for "${name}" is ambiguous.`);
      }
    }

    const factor = query.quantity / 100;
    return {
      name,
      calories: Math.round(best.macros.calories * factor),
      protein: round1(best.macros.protein * factor),
      carbs: round1(best.macros.carbs * factor),
      fat: round1(best.macros.fat * factor),
      source: 'usda-search',
      verified: false,
      confidence: 0.5,
      servingDescription: `${query.quantity} gram`,
      sourceNote: `Doğrulanmamış USDA arama sonucu · FDC #${best.food.fdcId} · ${best.food.description}`,
    };
  }
}
