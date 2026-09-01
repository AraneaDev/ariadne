import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import jsdoc from 'eslint-plugin-jsdoc'

export default tseslint.config(
  { ignores: ['node_modules/**', 'bin/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsdoc.configs['flat/recommended-typescript'],
  {
    rules: {
      'jsdoc/require-jsdoc': ['warn', { publicOnly: true, require: { FunctionDeclaration: true } }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
)
