# vendor/brand

A copy of `customer-front-end/packages/brand/src` (tests, `static.ts` and the
Python/email token files left out). `@booqy/brand` is not published, so
site-kit resolves the import to this folder (`vite.config.ts` alias,
`tsconfig.json` paths) and bundles it into `dist/`. Refresh it with the rest of
`src/` (`npm run sync:check` shows any drift) until brand is published.
