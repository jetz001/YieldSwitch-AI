export default [
  { ignores: ['.next/**', 'node_modules/**', 'dist/**', 'build/**'] },
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    plugins: {
      react: (await import('eslint-plugin-react')).default,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        require: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      'react/jsx-uses-vars': 'error',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
    },
    settings: {
      react: { version: 'detect' },
    },
  },
];
