import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // Keep the existing lint policy while upgrading Next. React Compiler is
      // not enabled; migrating these existing patterns is a separate change.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      // Allow unused vars that start with underscore
      "@typescript-eslint/no-unused-vars": ["error", { 
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_" 
      }],
      // Allow any types in specific cases but warn
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow unescaped entities in JSX
      "react/no-unescaped-entities": "off",
      // Image optimization warnings instead of errors
      "@next/next/no-img-element": "warn"
    }
  }
];

export default eslintConfig;
