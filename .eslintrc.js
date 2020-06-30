module.exports = {
  plugins: ['node', 'prettier'],
  env: {
    node: true,
    es6: true,
  },
  extends: [
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:node/recommended',
    'prettier',
  ],
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    'import/resolver': {
      node: {
        moduleDirectory: ['node_modules', '.'],
      },
    },
  },
}
