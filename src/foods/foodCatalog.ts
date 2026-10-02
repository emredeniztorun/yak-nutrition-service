import type { FoodNutritionResult, FoodQuery, FoodUnit } from '../types';
import { NutritionLookupError } from '../types';
import { FOOD_CATALOG_DATA } from './foodCatalog.data';

/**
 * The structured YAK food catalog — the single source of truth for every
 * predefined food. Replaces the old approach of live-searching USDA with
 * hand-tuned search terms on every request (which ranked differently from
 * request to request, picked wrong records such as "Babyfood, oatmeal" for
 * yulaf, and read serving sizes from whatever USDA portion metadata a
 * record happened to have).
 *
 * Each food carries:
 *  - verified per-100 g (or per-100 ml for labels) values copied from one
 *    cited source record (USDA FDC fdcId, or an official manufacturer
 *    label) — never computed, merged or guessed;
 *  - its own explicitly defined servings (1 adet / 1 porsiyon) and, for
 *    liquids, a density with its source, so every unit conversion is
 *    deterministic and documented;
 *  - or `status: 'unavailable'` when no verified source exists, in which
 *    case lookups answer food_not_found ("Besin bulunamadı") instead of
 *    guessing a substitute.
 */

export type CatalogSourceKind = 'usda-fdc' | 'manufacturer-label';

export interface CatalogServing {
  /** Exactly one of grams / ml is set. */
  grams?: number;
  ml?: number;
  /** Turkish, user-facing description of the serving (e.g. "1 büyük yumurta"). */
  label: string;
  /** Where the serving size comes from (a USDA household measure, or a YAK definition). */
  basis: string;
}

export interface CatalogFood {
  id: string;
  name: string;
  aliases: string[];
  /** The state the nutrition values describe — the state the food is normally eaten in. */
  state: 'cooked' | 'raw' | 'as-sold' | 'dry';
  status: 'verified' | 'unavailable';
  nutrition?: {
    /** per100ml is used only for manufacturer labels that are declared per 100 ml. */
    basis: 'per100g' | 'per100ml';
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  source?: {
    kind: CatalogSourceKind;
    reference: string;
    description: string;
    url: string;
  };
  /** Required for 'ml' support (and for per100ml foods entered in grams). */
  density?: { gramsPerMl: number; basis: string };
  adet?: CatalogServing;
  porsiyon?: CatalogServing;
  unavailableReason?: string;
}

/**
 * Normalizes a food name for matching: Turkish-aware lowercasing, Turkish
 * letters folded to ASCII (ı→i, ğ→g, ü→u, ş→s, ö→o, ç→c), punctuation
 * treated as spaces, whitespace collapsed. Also repairs the UTF-8
 * mojibake some Windows clients produce for Turkish letters.
 */
export function normalizeFoodName(value: string): string {
  const repaired = value
    .replace(/Ã§/g, 'ç').replace(/Ã‡/g, 'Ç').replace(/Ã¶/g, 'ö').replace(/Ã–/g, 'Ö')
    .replace(/Ã¼/g, 'ü').replace(/Ãœ/g, 'Ü').replace(/Ä±/g, 'ı').replace(/Ä°/g, 'İ')
    .replace(/ÄŸ/g, 'ğ').replace(/Äž/g, 'Ğ').replace(/ÅŸ/g, 'ş').replace(/Åž/g, 'Ş');
  return repaired
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[()\-,.'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const catalogIndex = new Map<string, CatalogFood>();

function register(key: string, food: CatalogFood): void {
  const normalized = normalizeFoodName(key);
  const existing = catalogIndex.get(normalized);
  if (existing && existing.id !== food.id) {
    // A catalog authoring error — two foods claiming the same name must
    // never be resolved silently by load order.
    throw new Error(`Food catalog alias collision: "${normalized}" → ${existing.id} and ${food.id}`);
  }
  catalogIndex.set(normalized, food);
}

for (const food of FOOD_CATALOG_DATA) {
  register(food.name, food);
  // "Bulgur (haşlanmış)" is also reachable as plain "bulgur".
  register(food.name.replace(/\s*\(.*?\)/g, ''), food);
  for (const alias of food.aliases) register(alias, food);
}

/** Finds a catalog food by its name or any alias (exact match after normalization). */
export function findCatalogFood(foodName: string): CatalogFood | undefined {
  return catalogIndex.get(normalizeFoodName(foodName));
}

/** The units a verified catalog food supports — derived from what it defines, never assumed. */
export function supportedUnits(food: CatalogFood): FoodUnit[] {
  const units: FoodUnit[] = ['gram'];
  if (food.density) units.push('ml');
  if (food.adet) units.push('adet');
  if (food.porsiyon) units.push('porsiyon');
  return units;
}

const SOURCE_NOTE_PREFIX: Record<CatalogSourceKind, string> = {
  'usda-fdc': 'USDA FoodData Central',
  'manufacturer-label': 'Üretici etiketi',
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatAmount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

/**
 * Computes nutrition for a verified catalog food. Every unit is converted
 * into the food's own basis through the food's own definitions:
 *
 *   gram      → grams = quantity
 *   ml        → ml = quantity; grams = ml × density
 *   adet      → the food's defined 1-adet serving × quantity
 *   porsiyon  → the food's defined 1-porsiyon serving × quantity
 *
 * then scaled from per-100 g (or per-100 ml) values. A liquid entered as
 * 250 ml is therefore always 250 ml of that liquid — never "250 servings".
 */
export function computeCatalogNutrition(food: CatalogFood, query: FoodQuery): FoodNutritionResult {
  if (food.status !== 'verified' || !food.nutrition || !food.source) {
    throw new NutritionLookupError(
      'food_not_found',
      `No verified nutrition source for "${food.name}". ${food.unavailableReason ?? ''}`.trim(),
    );
  }

  if (!supportedUnits(food).includes(query.unit)) {
    throw new NutritionLookupError('unsupported_unit', `"${food.name}" does not support the "${query.unit}" unit.`);
  }

  const quantity = query.quantity;
  const density = food.density?.gramsPerMl;
  let grams: number | undefined;
  let ml: number | undefined;
  // Whether the serving is naturally described in ml (drinks) or grams.
  let describeInMl = false;

  if (query.unit === 'gram') {
    grams = quantity;
  } else if (query.unit === 'ml') {
    ml = quantity;
  } else {
    const serving = query.unit === 'adet' ? food.adet : food.porsiyon;
    if (!serving) {
      throw new NutritionLookupError('unsupported_unit', `"${food.name}" does not support the "${query.unit}" unit.`);
    }
    if (serving.grams !== undefined) {
      grams = serving.grams * quantity;
    } else if (serving.ml !== undefined) {
      ml = serving.ml * quantity;
      describeInMl = true;
    }
  }

  // Fill in the other measure through the food's documented density.
  if (grams === undefined && ml !== undefined) {
    if (!density) throw new NutritionLookupError('unsupported_unit', `"${food.name}" has no density for ml.`);
    grams = ml * density;
  }
  if (ml === undefined && grams !== undefined && density) {
    ml = grams / density;
  }

  let factor: number;
  if (food.nutrition.basis === 'per100ml') {
    if (ml === undefined) {
      throw new NutritionLookupError('unsupported_unit', `"${food.name}" needs a density to convert grams.`);
    }
    factor = ml / 100;
  } else {
    factor = (grams as number) / 100;
  }

  // e.g. "150 gram", "250 ml", "2 adet (100 g)", "1 adet (330 ml)".
  const amountText =
    query.unit === 'gram' || query.unit === 'ml'
      ? `${formatAmount(quantity)} ${query.unit}`
      : `${formatAmount(quantity)} ${query.unit} (${
          describeInMl ? `${formatAmount(ml as number)} ml` : `${formatAmount(grams as number)} g`
        })`;

  return {
    name: food.name,
    calories: Math.round(food.nutrition.calories * factor),
    protein: round1(food.nutrition.protein * factor),
    carbs: round1(food.nutrition.carbs * factor),
    fat: round1(food.nutrition.fat * factor),
    source: food.source.kind,
    verified: true,
    confidence: 1,
    servingDescription: amountText,
    sourceNote: `${SOURCE_NOTE_PREFIX[food.source.kind]} · ${food.source.reference} · ${food.source.description}`,
  };
}
