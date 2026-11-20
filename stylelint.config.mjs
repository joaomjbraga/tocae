export default {
  extends: ['stylelint-config-recommended'],
  ignoreFiles: ['dist/**', 'dist-electron/**', 'node_modules/**'],
  rules: {
    // Component state selectors intentionally override generic hover and mode rules.
    'no-descending-specificity': null,
  },
}
