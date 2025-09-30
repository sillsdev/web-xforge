import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import jsdocPlugin from "eslint-plugin-jsdoc";

export default [
  // Global ignores
  {
    ignores: ["lib/**/*", "node_modules/**/*"]
  },

  // CommonJS files (jest.config.js)
  {
    files: ["*.js"],
    languageOptions: {
      globals: {
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly"
      },
      sourceType: "commonjs"
    },
    rules: {
      ...js.configs.recommended.rules
    }
  },

  // TypeScript configuration
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: ["./tsconfig.json"],
        createDefaultProgram: true
      },
      globals: {
        // Node.js globals
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        setImmediate: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        clearImmediate: "readonly",
        NodeJS: "readonly"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
      jsdoc: jsdocPlugin
    },
    settings: {
      "import/resolver": {
        node: {
          extensions: [".js", ".ts"]
        }
      }
    },
    rules: {
      // TypeScript ESLint recommended rules
      ...tseslint.configs.recommended.rules,

      // Custom TypeScript rules
      "@typescript-eslint/consistent-type-definitions": "error",
      "@typescript-eslint/dot-notation": "off",
      "@typescript-eslint/explicit-member-accessibility": [
        "off",
        {
          accessibility: "explicit"
        }
      ],
      "@typescript-eslint/naming-convention": ["error", { selector: "enumMember", format: ["PascalCase"] }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/no-deprecated": "warn",

      // General ESLint rules
      "brace-style": ["error", "1tbs"],
      "id-blacklist": "off",
      "id-match": "off",
      "max-len": [
        "error",
        {
          ignorePattern: "^import ",
          code: 120
        }
      ],
      "no-underscore-dangle": "off",

      // Import rules
      "import/named": "off",
      "import/order": [
        "error",
        {
          groups: [["builtin", "external"]]
        }
      ]
    }
  },

  // Jest test files configuration
  {
    files: ["**/*.spec.ts", "**/*.test.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: ["./tsconfig.json"],
        createDefaultProgram: true
      },
      globals: {
        // Node.js globals
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        setImmediate: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        clearImmediate: "readonly",
        NodeJS: "readonly",
        // Jest globals
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        beforeAll: "readonly",
        afterEach: "readonly",
        afterAll: "readonly",
        jest: "readonly"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
      jsdoc: jsdocPlugin
    },
    settings: {
      "import/resolver": {
        node: {
          extensions: [".js", ".ts"]
        }
      }
    },
    rules: {
      // TypeScript ESLint recommended rules
      ...tseslint.configs.recommended.rules,

      // Custom TypeScript rules
      "@typescript-eslint/consistent-type-definitions": "error",
      "@typescript-eslint/dot-notation": "off",
      "@typescript-eslint/explicit-member-accessibility": [
        "off",
        {
          accessibility: "explicit"
        }
      ],
      "@typescript-eslint/naming-convention": ["error", { selector: "enumMember", format: ["PascalCase"] }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/no-deprecated": "warn",

      // General ESLint rules
      "brace-style": ["error", "1tbs"],
      "id-blacklist": "off",
      "id-match": "off",
      "max-len": [
        "error",
        {
          ignorePattern: "^import ",
          code: 120
        }
      ],
      "no-underscore-dangle": "off",

      // Import rules
      "import/named": "off",
      "import/order": [
        "error",
        {
          groups: [["builtin", "external"]]
        }
      ]
    }
  },

  // Prettier configuration (should be last)
  prettierConfig
];
