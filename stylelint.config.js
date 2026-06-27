/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['client/dist/**'],
  overrides: [
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
    },
  ],
  rules: {
    'import-notation': null,
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['apply', 'theme'],
      },
    ],
  },
}
