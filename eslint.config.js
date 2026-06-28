import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['out/**', 'dist/**', 'build/**', 'node_modules/**'] },

  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },

  // Main / preload / config files run in Node (ESM).
  {
    files: [
      'src/main/**/*.js',
      'src/preload/**/*.js',
      'scripts/**/*.{js,mjs}',
      '*.config.{js,mjs}',
      'electron.vite.config.mjs',
      'vitest.config.js',
      'tailwind.config.js',
      'postcss.config.js',
      'eslint.config.js'
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node }
    }
  },

  // Renderer: browser + React.
  {
    files: ['src/renderer/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },

  // Tests (Vitest imports its globals explicitly; just needs Node).
  {
    files: ['test/**/*.js'],
    languageOptions: { globals: { ...globals.node } }
  }
]
