import type { NutritionProvider } from './NutritionProvider';
import type { FoodQuery, FoodNutritionResult } from '../types';
import { NutritionLookupError } from '../types';
import { computeCatalogNutrition, findCatalogFood } from '../foods/foodCatalog';

/**
 * The lookup order the whole app goes through:
 *
 *  1. The verified YAK food catalog (USDA FDC / official manufacturer
 *     label values, with explicitly defined servings). If the name matches
 *     a catalog food, the answer ALWAYS comes from the catalog — including
 *     "Besin bulunamadı" for known foods that have no verified source.
 *     A predefined food never falls through to a live search.
 *  2. Only for names the catalog does not know: the strict, unverified
 *     USDA free-text fallback (if a USDA key is configured).
 *  3. Otherwise: food_not_found.
 */
export class CatalogNutritionProvider implements NutritionProvider {
  constructor(private readonly freeTextFallback: NutritionProvider | null) {}

  async lookup(query: FoodQuery): Promise<FoodNutritionResult> {
    const catalogFood = findCatalogFood(query.foodName);
    if (catalogFood) {
      return computeCatalogNutrition(catalogFood, query);
    }

    if (this.freeTextFallback) {
      return this.freeTextFallback.lookup(query);
    }

    throw new NutritionLookupError('food_not_found', `"${query.foodName.trim()}" is not in the food catalog.`);
  }
}
