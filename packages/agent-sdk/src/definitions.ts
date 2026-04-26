import { defineAgent } from "./types.js";
import type { AgentDefinition, JSONSchema, TransformNode } from "../../shared/src/domain/types.js";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type CanonicalUnit = "oz" | "lb" | "g" | "count";
type PurchasableUnit = CanonicalUnit | "dozen";

type MealIngredient = {
  name: string;
  quantity: number;
  unit: CanonicalUnit;
};

type Nutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type GeneratedMeal = {
  mealType: MealType;
  name: string;
  ingredients: MealIngredient[];
};

type Meal = GeneratedMeal & {
  nutrition: Nutrition;
};

type PantryCoverage = {
  totalIngredientCount: number;
  coveredIngredientCount: number;
  uncoveredIngredientCount: number;
  fullyCovered: boolean;
};

type FinalPlan = {
  meals: Meal[];
  groceryList: Array<{
    item: string;
    quantity: number;
    unit: PurchasableUnit;
    estimatedCost: number;
  }>;
  totalCost: number;
};

type InternalPlan = FinalPlan & {
  pantryCoverage: PantryCoverage;
};

type NormalizedIngredient = {
  item: string;
  quantity: number;
  unit: CanonicalUnit;
};

type AggregatedIngredient = {
  item: string;
  quantity: number;
  unit: CanonicalUnit;
};

type PurchasableIngredient = {
  item: string;
  quantity: number;
  unit: PurchasableUnit;
  packages: number;
  unitPriceUsd: number;
};

type EvaluationResult = {
  score: number;
  passed: boolean;
  issues: string[];
  summary: string;
  shouldRetry: boolean;
  retryTargetNodeId?: string;
};

function withWrites<T>(node: T, writes: string[]): T & { writes: string[] } {
  return {
    ...node,
    writes
  };
}

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const OZ_TO_G = 28.3495;
const LB_TO_G = 453.592;
const DOZEN_COUNT = 12;

const nutritionSchema: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["calories", "protein", "carbs", "fat"],
  properties: {
    calories: { type: "number" },
    protein: { type: "number" },
    carbs: { type: "number" },
    fat: { type: "number" }
  }
};

const dailyTargetsSchema: JSONSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    calories: { type: "number" },
    protein: { type: "number" },
    carbs: { type: "number" },
    fat: { type: "number" }
  }
};

const ingredientSchema: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "quantity", "unit"],
  properties: {
    name: { type: "string" },
    quantity: { type: "number" },
    unit: { type: "string", enum: ["oz", "lb", "g", "count"] }
  }
};

const generatedMealSchema: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["mealType", "name", "ingredients"],
  properties: {
    mealType: {
      type: "string",
      enum: MEAL_TYPES
    },
    name: { type: "string" },
    ingredients: {
      type: "array",
      items: ingredientSchema
    }
  }
};

const mealSchema: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["mealType", "name", "ingredients", "nutrition"],
  properties: {
    mealType: {
      type: "string",
      enum: MEAL_TYPES
    },
    name: { type: "string" },
    ingredients: {
      type: "array",
      items: ingredientSchema
    },
    nutrition: nutritionSchema
  }
};

const pantryCoverageSchema: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["totalIngredientCount", "coveredIngredientCount", "uncoveredIngredientCount", "fullyCovered"],
  properties: {
    totalIngredientCount: { type: "number" },
    coveredIngredientCount: { type: "number" },
    uncoveredIngredientCount: { type: "number" },
    fullyCovered: { type: "boolean" }
  }
};

const finalPlanSchema: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["meals", "groceryList", "totalCost"],
  properties: {
    meals: {
      type: "array",
      items: mealSchema
    },
    groceryList: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item", "quantity", "unit", "estimatedCost"],
        properties: {
          item: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string", enum: ["oz", "lb", "g", "count", "dozen"] },
          estimatedCost: { type: "number" }
        }
      }
    },
    totalCost: { type: "number" }
  }
};

const internalPlanSchema: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["meals", "groceryList", "totalCost", "pantryCoverage"],
  properties: {
    meals: {
      type: "array",
      items: mealSchema
    },
    groceryList: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item", "quantity", "unit", "estimatedCost"],
        properties: {
          item: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string", enum: ["oz", "lb", "g", "count", "dozen"] },
          estimatedCost: { type: "number" }
        }
      }
    },
    totalCost: { type: "number" },
    pantryCoverage: pantryCoverageSchema
  }
};

const evaluationSchema: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["score", "passed", "issues", "summary", "shouldRetry"],
  properties: {
    score: { type: "number" },
    passed: { type: "boolean" },
    issues: {
      type: "array",
      items: { type: "string" }
    },
    summary: { type: "string" },
    shouldRetry: { type: "boolean" },
    retryTargetNodeId: { type: "string" }
  }
};

const desiredMealsSchema: JSONSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    breakfast: { type: "string" },
    lunch: { type: "string" },
    dinner: { type: "string" },
    snack: { type: "string" }
  }
};

const preferencesSchema: JSONSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    days: { type: "integer", minimum: 1, maximum: 7 },
    servings: { type: "integer", minimum: 1, maximum: 12 },
    budgetUsd: { type: "number", minimum: 1 },
    dietaryTags: {
      type: "array",
      items: { type: "string" }
    },
    allergies: {
      type: "array",
      items: { type: "string" }
    },
    pantry: {
      type: "array",
      items: { type: "string" }
    },
    desiredMeals: desiredMealsSchema,
    dailyTargets: dailyTargetsSchema,
    includeMeat: { type: "boolean" }
  }
};

type PriceCatalogEntry = {
  canonicalName: string;
  packageQuantity: number;
  packageUnit: PurchasableUnit;
  unitPriceUsd: number;
  defaultMealUnit: CanonicalUnit;
  aliases?: string[];
};

const PRICE_CATALOG: PriceCatalogEntry[] = [
  { canonicalName: "eggs", packageQuantity: 1, packageUnit: "dozen", unitPriceUsd: 3.79, defaultMealUnit: "count", aliases: ["egg"] },
  { canonicalName: "oats", packageQuantity: 18, packageUnit: "oz", unitPriceUsd: 4.29, defaultMealUnit: "g", aliases: ["rolled oats", "old fashioned oats"] },
  { canonicalName: "milk", packageQuantity: 64, packageUnit: "oz", unitPriceUsd: 3.89, defaultMealUnit: "oz" },
  { canonicalName: "greek yogurt", packageQuantity: 32, packageUnit: "oz", unitPriceUsd: 5.49, defaultMealUnit: "oz", aliases: ["yogurt"] },
  { canonicalName: "berries", packageQuantity: 12, packageUnit: "oz", unitPriceUsd: 4.99, defaultMealUnit: "oz", aliases: ["mixed berries", "blueberries", "strawberries"] },
  { canonicalName: "banana", packageQuantity: 1, packageUnit: "count", unitPriceUsd: 0.29, defaultMealUnit: "count", aliases: ["bananas"] },
  { canonicalName: "bread", packageQuantity: 1, packageUnit: "count", unitPriceUsd: 3.49, defaultMealUnit: "count", aliases: ["whole grain bread", "whole wheat bread"] },
  { canonicalName: "turkey slices", packageQuantity: 16, packageUnit: "oz", unitPriceUsd: 5.99, defaultMealUnit: "oz", aliases: ["turkey", "deli turkey"] },
  { canonicalName: "lettuce", packageQuantity: 1, packageUnit: "count", unitPriceUsd: 2.49, defaultMealUnit: "count", aliases: ["romaine", "greens"] },
  { canonicalName: "tomato", packageQuantity: 1, packageUnit: "count", unitPriceUsd: 0.99, defaultMealUnit: "count", aliases: ["tomatoes"] },
  { canonicalName: "chicken breast", packageQuantity: 1, packageUnit: "lb", unitPriceUsd: 6.99, defaultMealUnit: "g", aliases: ["chicken", "boneless chicken breast"] },
  { canonicalName: "rice", packageQuantity: 1, packageUnit: "lb", unitPriceUsd: 1.99, defaultMealUnit: "g", aliases: ["brown rice", "white rice"] },
  { canonicalName: "broccoli", packageQuantity: 12, packageUnit: "oz", unitPriceUsd: 2.99, defaultMealUnit: "g" },
  { canonicalName: "salmon", packageQuantity: 1, packageUnit: "lb", unitPriceUsd: 11.99, defaultMealUnit: "g", aliases: ["salmon fillet"] },
  { canonicalName: "apple", packageQuantity: 1, packageUnit: "count", unitPriceUsd: 0.89, defaultMealUnit: "count", aliases: ["apples"] },
  { canonicalName: "almonds", packageQuantity: 12, packageUnit: "oz", unitPriceUsd: 5.99, defaultMealUnit: "oz", aliases: ["almond"] },
  { canonicalName: "peanut butter", packageQuantity: 16, packageUnit: "oz", unitPriceUsd: 3.49, defaultMealUnit: "oz" },
  { canonicalName: "olive oil", packageQuantity: 16, packageUnit: "oz", unitPriceUsd: 8.49, defaultMealUnit: "oz" }
];

const PRICE_CATALOG_BY_NAME = new Map<string, PriceCatalogEntry>();
for (const entry of PRICE_CATALOG) {
  PRICE_CATALOG_BY_NAME.set(entry.canonicalName, entry);
  for (const alias of entry.aliases ?? []) {
    PRICE_CATALOG_BY_NAME.set(alias, entry);
  }
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cleanName(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

function canonicalizeItemName(value: unknown): string {
  const cleaned = cleanName(value);
  if (!cleaned) {
    return "ingredient";
  }

  return PRICE_CATALOG_BY_NAME.get(cleaned)?.canonicalName ?? cleaned;
}

function normalizeMealType(value: unknown, index: number): MealType {
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (MEAL_TYPES.includes(lowered as MealType)) {
      return lowered as MealType;
    }
  }

  return MEAL_TYPES[index] ?? "snack";
}

function defaultGeneratedMealTemplate(mealType: MealType): GeneratedMeal {
  switch (mealType) {
    case "breakfast":
      return {
        mealType,
        name: "Greek Yogurt Oat Bowl",
        ingredients: [
          { name: "greek yogurt", quantity: 6, unit: "oz" },
          { name: "oats", quantity: 60, unit: "g" },
          { name: "berries", quantity: 4, unit: "oz" }
        ]
      };
    case "lunch":
      return {
        mealType,
        name: "Turkey Sandwich",
        ingredients: [
          { name: "bread", quantity: 1, unit: "count" },
          { name: "turkey slices", quantity: 4, unit: "oz" },
          { name: "lettuce", quantity: 1, unit: "count" },
          { name: "tomato", quantity: 1, unit: "count" }
        ]
      };
    case "dinner":
      return {
        mealType,
        name: "Chicken Rice Bowl",
        ingredients: [
          { name: "chicken breast", quantity: 225, unit: "g" },
          { name: "rice", quantity: 150, unit: "g" },
          { name: "broccoli", quantity: 140, unit: "g" }
        ]
      };
    case "snack":
    default:
      return {
        mealType,
        name: "Apple and Almonds",
        ingredients: [
          { name: "apple", quantity: 1, unit: "count" },
          { name: "almonds", quantity: 1, unit: "oz" }
        ]
      };
  }
}

function defaultNutritionTemplate(mealType: MealType): Nutrition {
  switch (mealType) {
    case "breakfast":
      return { calories: 410, protein: 26, carbs: 45, fat: 12 };
    case "lunch":
      return { calories: 520, protein: 34, carbs: 39, fat: 21 };
    case "dinner":
      return { calories: 690, protein: 54, carbs: 57, fat: 18 };
    case "snack":
    default:
      return { calories: 250, protein: 6, carbs: 27, fat: 15 };
  }
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeUnit(value: unknown, item: string): CanonicalUnit {
  const unit = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (["g", "gram", "grams"].includes(unit)) {
    return "g";
  }
  if (["oz", "ounce", "ounces"].includes(unit)) {
    return "oz";
  }
  if (["lb", "lbs", "pound", "pounds"].includes(unit)) {
    return "lb";
  }
  if (["count", "each", "unit", "piece", "pieces", "slice", "slices", "clove", "cloves", "loaf", "head"].includes(unit)) {
    return "count";
  }
  if (["dozen"].includes(unit)) {
    return "count";
  }
  if (["cup", "cups"].includes(unit)) {
    return "oz";
  }
  if (["tbsp", "tablespoon", "tablespoons"].includes(unit)) {
    return "oz";
  }
  if (["tsp", "teaspoon", "teaspoons"].includes(unit)) {
    return "oz";
  }

  const catalogEntry = PRICE_CATALOG_BY_NAME.get(item);
  return catalogEntry?.defaultMealUnit ?? "count";
}

function normalizeQuantity(rawQuantity: unknown, rawUnit: unknown): number {
  let quantity = toFiniteNumber(rawQuantity, 1);
  const unit = typeof rawUnit === "string" ? rawUnit.trim().toLowerCase() : "";

  if (unit === "dozen") {
    return quantity * DOZEN_COUNT;
  }
  if (["cup", "cups"].includes(unit)) {
    return roundToTwoDecimals(quantity * 8);
  }
  if (["tbsp", "tablespoon", "tablespoons"].includes(unit)) {
    return roundToTwoDecimals(quantity * 0.5);
  }
  if (["tsp", "teaspoon", "teaspoons"].includes(unit)) {
    return roundToTwoDecimals(quantity * 0.17);
  }
  if (unit === "kg") {
    return roundToTwoDecimals(quantity * 1000);
  }

  return roundToTwoDecimals(quantity);
}

function normalizeIngredient(input: unknown): MealIngredient {
  const source = (input ?? {}) as Record<string, unknown>;
  const name = canonicalizeItemName(source.name);
  const unit = normalizeUnit(source.unit, name);
  const quantity = normalizeQuantity(source.quantity, source.unit);

  return {
    name,
    quantity,
    unit
  };
}

function isPlaceholderText(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase().startsWith("mock output");
}

function normalizeNutrition(input: unknown, fallback: Nutrition): Nutrition {
  const source = (input ?? {}) as Record<string, unknown>;

  return {
    calories: roundToTwoDecimals(toFiniteNumber(source.calories, fallback.calories)),
    protein: roundToTwoDecimals(toFiniteNumber(source.protein, fallback.protein)),
    carbs: roundToTwoDecimals(toFiniteNumber(source.carbs, fallback.carbs)),
    fat: roundToTwoDecimals(toFiniteNumber(source.fat, fallback.fat))
  };
}

function mapMealByType(generatedMeals: unknown[]): Map<MealType, unknown> {
  const mapped = new Map<MealType, unknown>();

  for (const [index, meal] of generatedMeals.entries()) {
    const candidate = meal as Record<string, unknown>;
    const mealType = normalizeMealType(candidate.mealType, index);
    if (!mapped.has(mealType)) {
      mapped.set(mealType, meal);
    }
  }

  return mapped;
}

function hasUsableGeneratedMeal(generated: Record<string, unknown> | undefined): boolean {
  if (!generated) {
    return false;
  }

  if (isPlaceholderText(generated.name)) {
    return false;
  }

  const ingredients = Array.isArray(generated.ingredients) ? generated.ingredients : [];
  if (ingredients.length === 0) {
    return false;
  }

  return ingredients.every((ingredient) => {
    const candidate = ingredient as Record<string, unknown>;
    return typeof candidate.name === "string" && candidate.name.trim().length > 0 && !isPlaceholderText(candidate.name);
  });
}

function convertToBaseUnit(quantity: number, unit: CanonicalUnit, item: string): NormalizedIngredient {
  const catalogEntry = PRICE_CATALOG_BY_NAME.get(item);
  const baseUnit = catalogEntry?.defaultMealUnit === "count" ? "count" : "g";

  if (baseUnit === "count") {
    return { item, quantity: roundToTwoDecimals(quantity), unit: "count" };
  }

  if (unit === "g") {
    return { item, quantity: roundToTwoDecimals(quantity), unit: "g" };
  }
  if (unit === "oz") {
    return { item, quantity: roundToTwoDecimals(quantity * OZ_TO_G), unit: "g" };
  }
  if (unit === "lb") {
    return { item, quantity: roundToTwoDecimals(quantity * LB_TO_G), unit: "g" };
  }

  return { item, quantity: roundToTwoDecimals(quantity), unit: "count" };
}

const normalizeMealsRun: TransformNode["run"] = (input) => {
  const generatedMeals = Array.isArray(input.meals) ? input.meals : [];
  const mappedByType = mapMealByType(generatedMeals);

  const meals: Meal[] = MEAL_TYPES.map((mealType, index) => {
    const generated = (mappedByType.get(mealType) ??
      generatedMeals[index] ??
      {}) as Record<string, unknown>;
    const fallbackMeal = defaultGeneratedMealTemplate(mealType);
    const fallbackNutrition = defaultNutritionTemplate(mealType);
    const useGeneratedMeal = hasUsableGeneratedMeal(generated);
    const ingredients = useGeneratedMeal && Array.isArray(generated.ingredients)
      ? generated.ingredients.map(normalizeIngredient).filter((ingredient) => ingredient.name && ingredient.quantity > 0)
      : fallbackMeal.ingredients;

    return {
      mealType,
      name: useGeneratedMeal && typeof generated.name === "string" && generated.name.trim()
        ? generated.name.trim()
        : fallbackMeal.name,
      ingredients: ingredients.length > 0 ? ingredients : fallbackMeal.ingredients,
      nutrition: normalizeNutrition(generated.nutrition, fallbackNutrition)
    };
  });

  return { meals };
};

function pantryItemsFromInput(input: unknown): Set<string> {
  if (!Array.isArray(input)) {
    return new Set();
  }

  return new Set(input.map((item) => canonicalizeItemName(item)));
}

const aggregateIngredientsRun: TransformNode["run"] = (input) => {
  const meals = Array.isArray(input.meals) ? (input.meals as Meal[]) : [];
  const pantryItems = pantryItemsFromInput(input.pantry);
  const aggregated = new Map<string, AggregatedIngredient>();
  let totalIngredientCount = 0;
  let coveredIngredientCount = 0;

  for (const meal of meals) {
    for (const ingredient of meal.ingredients) {
      totalIngredientCount += 1;
      const item = canonicalizeItemName(ingredient.name);
      if (pantryItems.has(item)) {
        coveredIngredientCount += 1;
        continue;
      }

      const baseIngredient = convertToBaseUnit(ingredient.quantity, ingredient.unit, item);
      const key = `${baseIngredient.item}:${baseIngredient.unit}`;
      const current = aggregated.get(key);

      if (current) {
        current.quantity = roundToTwoDecimals(current.quantity + baseIngredient.quantity);
      } else {
        aggregated.set(key, {
          item: baseIngredient.item,
          quantity: baseIngredient.quantity,
          unit: baseIngredient.unit
        });
      }
    }
  }

  const pantryCoverage: PantryCoverage = {
    totalIngredientCount,
    coveredIngredientCount,
    uncoveredIngredientCount: totalIngredientCount - coveredIngredientCount,
    fullyCovered: totalIngredientCount > 0 && coveredIngredientCount === totalIngredientCount
  };

  return {
    meals,
    aggregatedIngredients: Array.from(aggregated.values()).sort((left, right) => left.item.localeCompare(right.item)),
    pantryCoverage
  };
};

function convertAmountToPurchasableQuantity(quantity: number, unit: CanonicalUnit, packageUnit: PurchasableUnit): number {
  if (packageUnit === "count" && unit === "count") {
    return quantity;
  }
  if (packageUnit === "dozen" && unit === "count") {
    return quantity / DOZEN_COUNT;
  }
  if (packageUnit === "g" && unit === "g") {
    return quantity;
  }
  if (packageUnit === "oz" && unit === "g") {
    return quantity / OZ_TO_G;
  }
  if (packageUnit === "lb" && unit === "g") {
    return quantity / LB_TO_G;
  }
  if (packageUnit === "oz" && unit === "oz") {
    return quantity;
  }
  if (packageUnit === "lb" && unit === "lb") {
    return quantity;
  }

  return quantity;
}

const convertToPurchasableUnitsRun: TransformNode["run"] = (input) => {
  const meals = Array.isArray(input.meals) ? (input.meals as Meal[]) : [];
  const aggregatedIngredients = Array.isArray(input.aggregatedIngredients)
    ? (input.aggregatedIngredients as AggregatedIngredient[])
    : [];
  const pantryCoverage = input.pantryCoverage as PantryCoverage;

  const groceryList: PurchasableIngredient[] = aggregatedIngredients.map((ingredient) => {
    const catalogEntry = PRICE_CATALOG_BY_NAME.get(ingredient.item) ?? {
      canonicalName: ingredient.item,
      packageQuantity: ingredient.unit === "count" ? 1 : 1,
      packageUnit: ingredient.unit === "count" ? "count" : "lb",
      unitPriceUsd: ingredient.unit === "count" ? 1.49 : 4.99,
      defaultMealUnit: ingredient.unit
    };

    const purchasableAmount = convertAmountToPurchasableQuantity(
      ingredient.quantity,
      ingredient.unit,
      catalogEntry.packageUnit
    );
    const packages = Math.max(1, Math.ceil(purchasableAmount / catalogEntry.packageQuantity));
    const quantity = roundToTwoDecimals(packages * catalogEntry.packageQuantity);

    return {
      item: catalogEntry.canonicalName,
      quantity,
      unit: catalogEntry.packageUnit,
      packages,
      unitPriceUsd: catalogEntry.unitPriceUsd
    };
  });

  return {
    meals,
    groceryList,
    pantryCoverage
  };
};

const calculateCostsRun: TransformNode["run"] = (input) => {
  const meals = Array.isArray(input.meals) ? (input.meals as Meal[]) : [];
  const groceryList = Array.isArray(input.groceryList) ? (input.groceryList as PurchasableIngredient[]) : [];
  const pantryCoverage = input.pantryCoverage as PantryCoverage;

  const pricedGroceryList = groceryList.map((item) => ({
    item: titleCase(item.item),
    quantity: item.quantity,
    unit: item.unit,
    estimatedCost: roundToTwoDecimals(item.packages * item.unitPriceUsd)
  }));

  const totalCost = roundToTwoDecimals(
    pricedGroceryList.reduce((sum, item) => sum + item.estimatedCost, 0)
  );

  return {
    meals,
    groceryList: pricedGroceryList,
    totalCost,
    pantryCoverage
  } satisfies InternalPlan;
};

const finalizePlanRun: TransformNode["run"] = (input) => {
  const plan = input.plan as InternalPlan;
  return {
    meals: plan.meals,
    groceryList: plan.groceryList,
    totalCost: plan.totalCost
  } satisfies FinalPlan;
};

export const groceryAgentDefinition: AgentDefinition = defineAgent({
  id: "agent_grocery_planner",
  key: "grocery-planner",
  version: "2.0.0",
  name: "Grocery Planner",
  description:
    "Generates a single-day structured meal plan, normalizes ingredients into a grocery list, and assigns realistic grocery costs.",
  inputSchema: {
    type: "object",
    required: ["preferences"],
    additionalProperties: false,
    properties: {
      preferences: preferencesSchema
    }
  },
  uiSchema: {
    version: "1",
    title: "Grocery Planner",
    description: "Configure a daily meal plan, optional nutrition targets, and grocery preferences.",
    sections: [
      {
        title: "Plan Preferences",
        fields: [
          { name: "preferences.budgetUsd", label: "Reference Budget ($)", type: "number", required: false, defaultValue: 35 }
        ]
      },
      {
        title: "Nutrition Targets",
        fields: [
          { name: "preferences.dailyTargets.calories", label: "Calories", type: "number", required: false },
          { name: "preferences.dailyTargets.protein", label: "Protein (g)", type: "number", required: false },
          { name: "preferences.dailyTargets.carbs", label: "Carbs (g)", type: "number", required: false },
          { name: "preferences.dailyTargets.fat", label: "Fat (g)", type: "number", required: false }
        ]
      },
      {
        title: "Dietary Options",
        fields: [
          {
            name: "preferences.dietaryTags",
            label: "Dietary Tags",
            type: "textarea",
            required: false,
            placeholder: "high-protein, Mediterranean"
          },
          {
            name: "preferences.allergies",
            label: "Allergies",
            type: "textarea",
            required: false,
            placeholder: "peanuts, shellfish"
          },
          {
            name: "preferences.pantry",
            label: "Pantry Items",
            type: "textarea",
            required: false,
            placeholder: "olive oil, rice, salt"
          },
          {
            name: "preferences.includeMeat",
            label: "Include Meat?",
            type: "boolean",
            required: false,
            defaultValue: true
          }
        ]
      },
      {
        title: "Desired Meals",
        fields: [
          {
            name: "preferences.desiredMeals.breakfast",
            label: "Breakfast Preference",
            type: "text",
            required: false,
            placeholder: "oatmeal with honey and almonds"
          },
          {
            name: "preferences.desiredMeals.lunch",
            label: "Lunch Preference",
            type: "text",
            required: false,
            placeholder: "turkey sandwich with avocado"
          },
          {
            name: "preferences.desiredMeals.dinner",
            label: "Dinner Preference",
            type: "text",
            required: false,
            placeholder: "salmon with rice and broccoli"
          },
          {
            name: "preferences.desiredMeals.snack",
            label: "Snack Preference",
            type: "text",
            required: false,
            placeholder: "apple with almonds"
          }
        ]
      }
    ]
  },
  dag: {
    id: "dag_grocery_planner",
    version: "2.0.0",
    name: "Grocery Planner DAG",
    description: "Separate LLM steps for meal generation and nutrition estimation followed by deterministic transforms for normalization, grocery aggregation, purchasable conversion, and costing.",
    nodes: [
      withWrites({
        id: "generateMeals",
        type: "llm",
        name: "Generate Meals",
        version: "2.0.0",
        deterministic: false,
        promptTemplate: `
Generate a one-day meal plan with 4 meals.

Inputs:
- dietaryTags: {{preferences.dietaryTags}}
- allergies: {{preferences.allergies}}
- pantry: {{preferences.pantry}}
- desiredMeals: {{preferences.desiredMeals}}
- includeMeat: {{preferences.includeMeat}}

Task:
Return exactly 4 meals: breakfast, lunch, dinner, snack.

Each meal must include:
- mealType
- name
- ingredients [{ name, quantity, unit }]

Rules:
- Do not include nutrition.
- Use practical, real-world meals and ingredient quantities.
- Prefer ingredients from the pantry when possible.
- Reuse ingredients across meals to reduce total grocery variety.
- Still include some variety across meals (avoid duplicates).
- Use units: oz, lb, g, or count.
- Assume basic staples (water, salt, pepper, olive oil) are available.

Preferences:
- If desiredMeals specifies a mealType, match it closely.
- If includeMeat is true, include meat in either the lunch or dinner meal.

Output:
Return STRICT JSON only.
`,
        input: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["preferences"],
            properties: {
              preferences: preferencesSchema
            }
          },
          bindings: [
            {
              key: "preferences",
              ref: { source: "job_input", path: "preferences" }
            }
          ]
        },
        output: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["meals"],
            properties: {
              meals: {
                type: "array",
                minItems: 4,
                maxItems: 4,
                items: generatedMealSchema
              }
            }
          },
          outputKind: "structured"
        },
        outputConfig: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["meals"],
            properties: {
              meals: {
                type: "array",
                minItems: 4,
                maxItems: 4,
                items: generatedMealSchema
              }
            }
          },
          enforcement: "strict"
        }
      }, ["$state.generateMeals"]),
      withWrites({
        id: "estimateNutrition",
        type: "llm",
        name: "Estimate Nutrition",
        version: "2.0.0",
        deterministic: false,
        promptTemplate: `
Estimate nutrition for each meal.

Meals: {{meals}}

Task:
For each meal, return calories, protein (g), carbs (g), and fat (g).

Rules:
- Do not modify mealType, name, or ingredients.
- Use ingredient quantities to estimate totals.
- Keep estimates realistic and internally consistent.
- Similar ingredients should produce similar nutrition across meals.
- Round to whole numbers.

Output:
Return the same structure with a "nutrition" object added to each meal.

Strict JSON only.
`,
        input: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["meals"],
            properties: {
              meals: {
                type: "array",
                minItems: 4,
                maxItems: 4,
                items: generatedMealSchema
              }
            }
          },
          bindings: [
            {
              key: "meals",
              ref: { source: "node_output", nodeId: "generateMeals", path: "meals" }
            }
          ]
        },
        output: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["meals"],
            properties: {
              meals: {
                type: "array",
                minItems: 4,
                maxItems: 4,
                items: mealSchema
              }
            }
          },
          outputKind: "structured"
        },
        outputConfig: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["meals"],
            properties: {
              meals: {
                type: "array",
                minItems: 4,
                maxItems: 4,
                items: mealSchema
              }
            }
          },
          enforcement: "strict"
        }
      }, ["$state.estimateNutrition"]),
      withWrites({
        id: "normalizeMeals",
        type: "transform",
        name: "Normalize Meals",
        version: "2.0.0",
        deterministic: true,
        input: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["meals"],
            properties: {
              meals: {
                type: "array",
                items: mealSchema
              }
            }
          },
          bindings: [
            {
              key: "meals",
              ref: { source: "node_output", nodeId: "estimateNutrition", path: "meals" }
            }
          ]
        },
        output: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["meals"],
            properties: {
              meals: {
                type: "array",
                minItems: 4,
                maxItems: 4,
                items: mealSchema
              }
            }
          }
        },
        run: normalizeMealsRun
      }, ["$state.normalizeMeals"]),
      withWrites({
        id: "aggregateIngredients",
        type: "transform",
        name: "Aggregate Ingredients",
        version: "2.0.0",
        deterministic: true,
        input: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["meals"],
            properties: {
              meals: {
                type: "array",
                items: mealSchema
              },
              pantry: {
                type: "array",
                items: { type: "string" }
              }
            }
          },
          bindings: [
            {
              key: "meals",
              ref: { source: "node_output", nodeId: "normalizeMeals", path: "meals" }
            },
            {
              key: "pantry",
              optional: true,
              ref: { source: "job_input", path: "preferences.pantry" }
            }
          ]
        },
        output: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["meals", "aggregatedIngredients", "pantryCoverage"],
            properties: {
              meals: {
                type: "array",
                items: mealSchema
              },
              aggregatedIngredients: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["item", "quantity", "unit"],
                  properties: {
                    item: { type: "string" },
                    quantity: { type: "number" },
                    unit: { type: "string", enum: ["oz", "lb", "g", "count"] }
                  }
                }
              },
              pantryCoverage: pantryCoverageSchema
            }
          }
        },
        run: aggregateIngredientsRun
      }, ["$state.aggregateIngredients"]),
      withWrites({
        id: "convertToPurchasableUnits",
        type: "transform",
        name: "Convert To Purchasable Units",
        version: "2.0.0",
        deterministic: true,
        input: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["meals", "aggregatedIngredients", "pantryCoverage"],
            properties: {
              meals: {
                type: "array",
                items: mealSchema
              },
              aggregatedIngredients: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["item", "quantity", "unit"],
                  properties: {
                    item: { type: "string" },
                    quantity: { type: "number" },
                    unit: { type: "string", enum: ["oz", "lb", "g", "count"] }
                  }
                }
              },
              pantryCoverage: pantryCoverageSchema
            }
          },
          bindings: [
            {
              key: "meals",
              ref: { source: "node_output", nodeId: "aggregateIngredients", path: "meals" }
            },
            {
              key: "aggregatedIngredients",
              ref: { source: "node_output", nodeId: "aggregateIngredients", path: "aggregatedIngredients" }
            },
            {
              key: "pantryCoverage",
              ref: { source: "node_output", nodeId: "aggregateIngredients", path: "pantryCoverage" }
            }
          ]
        },
        output: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["meals", "groceryList", "pantryCoverage"],
            properties: {
              meals: {
                type: "array",
                items: mealSchema
              },
              groceryList: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["item", "quantity", "unit", "packages", "unitPriceUsd"],
                  properties: {
                    item: { type: "string" },
                    quantity: { type: "number" },
                    unit: { type: "string", enum: ["oz", "lb", "g", "count", "dozen"] },
                    packages: { type: "number" },
                    unitPriceUsd: { type: "number" }
                  }
                }
              },
              pantryCoverage: pantryCoverageSchema
            }
          }
        },
        run: convertToPurchasableUnitsRun
      }, ["$state.convertToPurchasableUnits"]),
      withWrites({
        id: "calculateCosts",
        type: "transform",
        name: "Calculate Costs",
        version: "2.0.0",
        deterministic: true,
        input: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["meals", "groceryList", "pantryCoverage"],
            properties: {
              meals: {
                type: "array",
                items: mealSchema
              },
              groceryList: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["item", "quantity", "unit", "packages", "unitPriceUsd"],
                  properties: {
                    item: { type: "string" },
                    quantity: { type: "number" },
                    unit: { type: "string", enum: ["oz", "lb", "g", "count", "dozen"] },
                    packages: { type: "number" },
                    unitPriceUsd: { type: "number" }
                  }
                }
              },
              pantryCoverage: pantryCoverageSchema
            }
          },
          bindings: [
            {
              key: "meals",
              ref: { source: "node_output", nodeId: "convertToPurchasableUnits", path: "meals" }
            },
            {
              key: "groceryList",
              ref: { source: "node_output", nodeId: "convertToPurchasableUnits", path: "groceryList" }
            },
            {
              key: "pantryCoverage",
              ref: { source: "node_output", nodeId: "convertToPurchasableUnits", path: "pantryCoverage" }
            }
          ]
        },
        output: {
          schema: internalPlanSchema
        },
        run: calculateCostsRun
      }, ["$state.calculateCosts"]),
      withWrites({
        id: "validatePlan",
        type: "evaluator",
        name: "Validate Structured Plan",
        version: "2.0.0",
        deterministic: false,
        promptTemplate: `
Validate a grocery planning result.

Inputs:
- plan: {{plan}}
- pantryCoverage: {{pantryCoverage}}
- dailyTargets: {{dailyTargets}}

Definitions:
- Pantry-covered ingredients are NOT required in the grocery list.
- The grocery list should include ONLY ingredients not covered by the pantry.

---

Hard failures (must retry):
- Missing any meal type (breakfast, lunch, dinner, snack)
- Any meal missing ingredients or nutrition
- Grocery list entries missing item, quantity, unit, or estimatedCost
- totalCost is missing, non-numeric, or negative
- Grocery list is empty AND pantryCoverage.fullyCovered is false

---

Soft issues (do not retry):
- Nutrition not closely aligned with targets
- Slightly unrealistic quantities
- Inefficient or redundant grocery items

---

Task:
1. List all issues clearly.
2. Determine if a retry is required (only for hard failures).
3. If retry is required, select the EARLIEST node that can fix it:
   - meal structure issues → "generateMeals"
   - nutrition issues → "estimateNutrition"
   - grocery or cost issues → "calculateCosts"

---

Output JSON:
{
  "score": number,              // 0 to 1
  "passed": boolean,
  "issues": string[],
  "summary": string,
  "shouldRetry": boolean,
  "retryTargetNodeId"?: string
}
`,
        input: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["plan", "pantryCoverage"],
            properties: {
              plan: internalPlanSchema,
              pantryCoverage: pantryCoverageSchema,
              dailyTargets: dailyTargetsSchema
            }
          },
          bindings: [
            {
              key: "plan",
              ref: { source: "node_output", nodeId: "calculateCosts" }
            },
            {
              key: "pantryCoverage",
              ref: { source: "node_output", nodeId: "calculateCosts", path: "pantryCoverage" }
            },
            {
              key: "dailyTargets",
              optional: true,
              ref: { source: "job_input", path: "preferences.dailyTargets" }
            }
          ]
        },
        output: {
          schema: evaluationSchema,
          outputKind: "critique"
        }
      }, ["$state.validatePlan"]),
      withWrites({
        id: "finalizePlan",
        type: "transform",
        name: "Finalize Plan",
        version: "2.0.0",
        deterministic: true,
        input: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["plan", "evaluation"],
            properties: {
              plan: internalPlanSchema,
              evaluation: evaluationSchema
            }
          },
          bindings: [
            {
              key: "plan",
              ref: { source: "node_output", nodeId: "calculateCosts" }
            },
            {
              key: "evaluation",
              ref: { source: "node_output", nodeId: "validatePlan" }
            }
          ]
        },
        output: {
          schema: finalPlanSchema
        },
        run: finalizePlanRun
      }, ["$state.finalizePlan"])
    ]
  }
});

// currently daily will make daily
export const dailyGroceryPlanner = groceryAgentDefinition;

export const seedAgentDefinitions: AgentDefinition[] = [groceryAgentDefinition];
