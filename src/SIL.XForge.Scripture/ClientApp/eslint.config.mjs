import angular from '@angular-eslint/eslint-plugin';
import angularTemplate from '@angular-eslint/eslint-plugin-template';
import angularTemplateParser from '@angular-eslint/template-parser';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
  {
    ignores: ['projects/**/*']
  },
  // TypeScript files
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: ['tsconfig.json', 'src/tsconfig.app.json', 'src/tsconfig.spec.json', '.storybook/tsconfig.json'],
        createDefaultProgram: true
      }
    },
    plugins: {
      '@angular-eslint': angular,
      '@typescript-eslint': typescriptEslint,
      import: importPlugin,
      jsdoc: jsdocPlugin,
      prettier: prettierPlugin
    },
    rules: {
      // Angular rules
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case'
        }
      ],
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase'
        }
      ],

      // TypeScript rules
      '@typescript-eslint/consistent-type-definitions': 'error',
      '@typescript-eslint/dot-notation': 'off',
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true
        }
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'off',
        {
          accessibility: 'explicit'
        }
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'enumMember',
          format: ['PascalCase']
        }
      ],
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            arguments: false,
            properties: false,
            inheritedMethods: false
          }
        }
      ],
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-useless-catch': 'off',
      '@typescript-eslint/no-deprecated': 'warn', // Replaces deprecated eslint-plugin-deprecation

      // General rules
      'brace-style': ['error', '1tbs'],
      eqeqeq: [
        'error',
        'always',
        {
          null: 'ignore'
        }
      ],
      'id-blacklist': 'off',
      'id-match': 'off',
      'import/order': [
        'error',
        {
          groups: [['builtin', 'external']]
        }
      ],
      'max-len': [
        'error',
        {
          ignorePattern: '^import ',
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          code: 120
        }
      ],
      'no-underscore-dangle': 'off',
      'prefer-const': ['warn', { ignoreReadBeforeAssign: true }],
      'no-var': 'warn'
    }
  },
  // HTML template files
  {
    files: ['**/*.html'],
    languageOptions: {
      parser: angularTemplateParser
    },
    plugins: {
      '@angular-eslint/template': angularTemplate
    },
    rules: {
      ...angularTemplate.configs.recommended.rules,
      '@angular-eslint/template/eqeqeq': [
        'error',
        {
          allowNullOrUndefined: true
        }
      ]
    }
  },
  // Spec and story files - disable some rules
  {
    files: ['**/*.spec.ts', '**/*.stories.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off'
    }
  },
  // Apply prettier config (should be last)
  eslintConfigPrettier
];
