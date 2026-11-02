export default [
  {
    files: ["site/**/*.js", "tests/**/*.js", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        Uint8Array: "readonly",
        AbortSignal: "readonly",
        process: "readonly",
        document: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        TextDecoder: "readonly",
        Worker: "readonly",
        URL: "readonly",
        Blob: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        self: "readonly",
        console: "readonly",
        structuredClone: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      eqeqeq: "error",
      "no-eval": "error",
    },
  },
];
