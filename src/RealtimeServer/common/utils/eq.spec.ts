import { eq } from './eq';
import 'jest-expect-message';

describe('eq', () => {
  it('compares two objects', () => {
    // tslint:disable: no-construct
    // Basic equality and identity comparisons.
    expect(eq(null, null), '`null` is equal to `null`').toBe(true);
    expect(eq(undefined, undefined), '`undefined` is equal to `undefined`').toBe(true);

    expect(eq(0, -0), '`0` is not equal to `-0`').toBe(false);
    expect(eq(-0, 0), 'Commutative equality is implemented for `0` and `-0`').toBe(false);
    expect(eq(null, undefined), '`null` is not equal to `undefined`').toBe(false);
    expect(eq(undefined, null), 'Commutative equality is implemented for `null` and `undefined`').toBe(false);

    // String object and primitive comparisons.
    expect(eq('Curly', 'Curly'), 'Identical string primitives are equal').toBe(true);
    expect(
      eq(new String('Curly'), new String('Curly')),
      'String objects with identical primitive values are equal'
    ).toBe(true);
    expect(
      eq(new String('Curly'), 'Curly'),
      'String primitives and their corresponding object wrappers are equal'
    ).toBe(true);
    expect(
      eq('Curly', new String('Curly')),
      'Commutative equality is implemented for string objects and primitives'
    ).toBe(true);

    expect(eq('Curly', 'Larry'), 'String primitives with different values are not equal').toBe(false);
    expect(
      eq(new String('Curly'), new String('Larry')),
      'String objects with different primitive values are not equal'
    ).toBe(false);
    expect(
      eq(new String('Curly'), {
        toString: function () {
          return 'Curly';
        }
      }),
      'String objects and objects with a custom `toString` method are not equal'
    ).toBe(false);

    // Number object and primitive comparisons.
    expect(eq(75, 75), 'Identical number primitives are equal').toBe(true);
    expect(eq(new Number(75), new Number(75)), 'Number objects with identical primitive values are equal').toBe(true);
    expect(eq(75, new Number(75)), 'Number primitives and their corresponding object wrappers are equal').toBe(true);
    expect(eq(new Number(75), 75), 'Commutative equality is implemented for number objects and primitives').toBe(true);
    expect(eq(new Number(0), -0), '`new Number(0)` and `-0` are not equal').toBe(false);
    expect(eq(0, new Number(-0)), 'Commutative equality is implemented for `new Number(0)` and `-0`').toBe(false);

    expect(eq(new Number(75), new Number(63)), 'Number objects with different primitive values are not equal').toBe(
      false
    );
    expect(
      eq(new Number(63), {
        valueOf: function () {
          return 63;
        }
      }),
      'Number objects and objects with a `valueOf` method are not equal'
    ).toBe(false);

    // Comparisons involving `NaN`.
    expect(eq(NaN, NaN), '`NaN` is equal to `NaN`').toBe(true);
    expect(eq(61, NaN), 'A number primitive is not equal to `NaN`').toBe(false);
    expect(eq(new Number(79), NaN), 'A number object is not equal to `NaN`').toBe(false);
    expect(eq(Infinity, NaN), '`Infinity` is not equal to `NaN`').toBe(false);

    // Boolean object and primitive comparisons.
    expect(eq(true, true), 'Identical boolean primitives are equal').toBe(true);
    expect(eq(new Boolean(), new Boolean()), 'Boolean objects with identical primitive values are equal').toBe(true);
    expect(eq(true, new Boolean(true)), 'Boolean primitives and their corresponding object wrappers are equal').toBe(
      true
    );
    expect(eq(new Boolean(true), true), 'Commutative equality is implemented for booleans').toBe(true);
    expect(eq(new Boolean(true), new Boolean()), 'Boolean objects with different primitive values are not equal').toBe(
      false
    );

    // Common type coercions.
    expect(eq(true, new Boolean(false)), 'Boolean objects are not equal to the boolean primitive `true`').toBe(false);
    expect(eq('75', 75), 'String and number primitives with like values are not equal').toBe(false);
    expect(eq(new Number(63), new String(63)), 'String and number objects with like values are not equal').toBe(false);
    expect(eq(75, '75'), 'Commutative equality is implemented for like string and number values').toBe(false);
    expect(eq(0, ''), 'Number and string primitives with like values are not equal').toBe(false);
    expect(eq(1, true), 'Number and boolean primitives with like values are not equal').toBe(false);
    expect(eq(new Boolean(false), new Number(0)), 'Boolean and number objects with like values are not equal').toBe(
      false
    );
    expect(eq(false, new String('')), 'Boolean primitives and string objects with like values are not equal').toBe(
      false
    );
    expect(
      eq(12564504e5, new Date(2009, 9, 25)),
      'Dates and their corresponding numeric primitive values are not equal'
    ).toBe(false);

    // Dates.
    expect(eq(new Date(2009, 9, 25), new Date(2009, 9, 25)), 'Date objects referencing identical times are equal').toBe(
      true
    );
    expect(
      eq(new Date(2009, 9, 25), new Date(2009, 11, 13)),
      'Date objects referencing different times are not equal'
    ).toBe(false);
    expect(
      eq(new Date(2009, 11, 13), {
        getTime: function () {
          return 12606876e5;
        }
      }),
      'Date objects and objects with a `getTime` method are not equal'
    ).toBe(false);
    expect(eq(new Date('Curly'), new Date('Curly')), 'Invalid dates are not equal').toBe(false);

    // RegExps.
    expect(eq(/(?:)/gim, /(?:)/gim), 'RegExps with equivalent patterns and flags are equal').toBe(true);
    expect(eq(/(?:)/g, /(?:)/gi), 'RegExps with equivalent patterns and different flags are not equal').toBe(false);
    expect(eq(/Moe/gim, /Curly/gim), 'RegExps with different patterns and equivalent flags are not equal').toBe(false);
    expect(eq(/(?:)/gi, /(?:)/g), 'Commutative equality is implemented for RegExps').toBe(false);
    expect(
      eq(/Curly/g, { source: 'Larry', global: true, ignoreCase: false, multiline: false }),
      'RegExps and RegExp-like objects are not equal'
    ).toBe(false);

    // Empty arrays, array-like objects, and object literals.
    expect(eq({}, {}), 'Empty object literals are equal').toBe(true);
    expect(eq([], []), 'Empty array literals are equal').toBe(true);
    expect(eq([{}], [{}]), 'Empty nested arrays and objects are equal').toBe(true);
    expect(eq({ length: 0 }, []), 'Array-like objects and arrays are not equal.').toBe(false);
    expect(eq([], { length: 0 }), 'Commutative equality is implemented for array-like objects').toBe(false);

    expect(eq({}, []), 'Object literals and array literals are not equal').toBe(false);
    expect(eq([], {}), 'Commutative equality is implemented for objects and arrays').toBe(false);

    // Arrays with primitive and object values.
    expect(eq([1, 'Larry', true], [1, 'Larry', true]), 'Arrays containing identical primitives are equal').toBe(true);
    expect(
      eq([/Moe/g, new Date(2009, 9, 25)], [/Moe/g, new Date(2009, 9, 25)]),
      'Arrays containing equivalent elements are equal'
    ).toBe(true);

    // Multi-dimensional arrays.
    let a: any = [
      new Number(47),
      false,
      'Larry',
      /Moe/,
      new Date(2009, 11, 13),
      ['running', 'biking', new String('programming')],
      { a: 47 }
    ];
    let b: any = [
      new Number(47),
      false,
      'Larry',
      /Moe/,
      new Date(2009, 11, 13),
      ['running', 'biking', new String('programming')],
      { a: 47 }
    ];
    expect(eq(a, b), 'Arrays containing nested arrays and objects are recursively compared').toBe(true);

    // Array elements and properties.
    a.push('White Rocks');
    expect(eq(a, b), 'Arrays of different lengths are not equal').toBe(false);
    a.push('East Boulder');
    b.push('Gunbarrel Ranch', 'Teller Farm');
    expect(eq(a, b), 'Arrays of identical lengths containing different elements are not equal').toBe(false);

    // Sparse arrays.
    expect(eq(Array(3), Array(3)), 'Sparse arrays of identical lengths are equal').toBe(true);
    expect(eq(Array(3), Array(6)), 'Sparse arrays of different lengths are not equal when both are empty').toBe(false);

    // Simple objects.
    expect(
      eq({ a: 'Curly', b: 1, c: true }, { a: 'Curly', b: 1, c: true }),
      'Objects containing identical primitives are equal'
    ).toBe(true);
    expect(
      eq({ a: /Curly/g, b: new Date(2009, 11, 13) }, { a: /Curly/g, b: new Date(2009, 11, 13) }),
      'Objects containing equivalent members are equal'
    ).toBe(true);
    expect(
      eq({ a: 63, b: 75 }, { a: 61, b: 55 }),
      'Objects of identical sizes with different values are not equal'
    ).toBe(false);
    expect(
      eq({ a: 63, b: 75 }, { a: 61, c: 55 }),
      'Objects of identical sizes with different property names are not equal'
    ).toBe(false);
    expect(eq({ a: 1, b: 2 }, { a: 1 }), 'Objects of different sizes are not equal').toBe(false);
    expect(eq({ a: 1 }, { a: 1, b: 2 }), 'Commutative equality is implemented for objects').toBe(false);
    expect(
      eq({ x: 1, y: undefined }, { x: 1, z: 2 }),
      'Objects with identical keys and different values are not equivalent'
    ).toBe(false);

    // `A` contains nested objects and arrays.
    a = {
      name: new String('Moe Howard'),
      age: new Number(77),
      stooge: true,
      hobbies: ['acting'],
      film: {
        name: 'Sing a Song of Six Pants',
        release: new Date(1947, 9, 30),
        stars: [new String('Larry Fine'), 'Shemp Howard'],
        minutes: new Number(16),
        seconds: 54
      }
    };

    // `B` contains equivalent nested objects and arrays.
    b = {
      name: new String('Moe Howard'),
      age: new Number(77),
      stooge: true,
      hobbies: ['acting'],
      film: {
        name: 'Sing a Song of Six Pants',
        release: new Date(1947, 9, 30),
        stars: [new String('Larry Fine'), 'Shemp Howard'],
        minutes: new Number(16),
        seconds: 54
      }
    };
    expect(eq(a, b), 'Objects with nested equivalent members are recursively compared').toBe(true);
    // tslint:enable: no-construct
  });
});
