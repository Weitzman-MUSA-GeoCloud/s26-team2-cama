export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: [
    "node_modules/**",
    "venv_issue6/**",
  ],
  rules: {
    "alpha-value-notation": null,
    "color-function-alias-notation": null,
    "color-function-notation": null,
    "color-hex-length": null,
    "declaration-block-no-redundant-longhand-properties": null,
    "font-family-name-quotes": null,
    "keyframes-name-pattern": null,
    "media-feature-range-notation": null,
    "no-descending-specificity": null,
    "no-duplicate-selectors": null,
    "property-no-vendor-prefix": null,
    "rule-empty-line-before": null,
    "selector-class-pattern": null,
    "selector-id-pattern": null,
    "selector-no-vendor-prefix": null,
  },
};
