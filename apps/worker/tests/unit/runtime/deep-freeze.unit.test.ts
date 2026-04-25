import { describe, expect, it } from "vitest";
import { deepFreeze } from "../../../src/runtime/deep-freeze.js";

describe("deepFreeze", () => {
  it("returns primitives unchanged", () => {
    expect(deepFreeze(1)).toBe(1);
    expect(deepFreeze("hello")).toBe("hello");
    expect(deepFreeze(null)).toBeNull();
  });

  it("recursively freezes nested objects and arrays", () => {
    const value = {
      plan: {
        meals: [
          {
            name: "Breakfast",
            ingredients: [{ name: "oats", quantity: 1 }]
          }
        ]
      }
    };

    const frozen = deepFreeze(value);

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.plan)).toBe(true);
    expect(Object.isFrozen(frozen.plan.meals)).toBe(true);
    expect(Object.isFrozen(frozen.plan.meals[0])).toBe(true);
    expect(Object.isFrozen(frozen.plan.meals[0]?.ingredients)).toBe(true);
    expect(Object.isFrozen(frozen.plan.meals[0]?.ingredients[0])).toBe(true);
  });
});
