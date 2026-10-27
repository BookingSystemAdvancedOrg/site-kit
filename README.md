# @booqy/site-kit

Everything on a restaurant's website that isn't the look: the API client and
tenant resolution, the booking, menu, ordering/checkout (Stripe Elements),
catering, opening hours, GDPR and legal flows, analytics, and hooks for
custom designs. A site (`site-template`, and one private repo `site-<slug>`
per restaurant in BookingSystemAdvancedOrg, created from it) only holds
layout, pages and look. Plan: `application/docs/orchestrator/CUSTOMER-SITES-PLAN.md`.

## Use it in a site

```tsx
// main.tsx
import { SiteProvider, configureSiteKit } from '@booqy/site-kit'
import '@booqy/site-kit/styles.css' // before the site's own CSS
import './site.css'

configureSiteKit({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  devTenantSlug: import.meta.env.VITE_DEV_TENANT_SLUG,
  menuImageBaseUrl: import.meta.env.VITE_MENU_IMAGE_BASE_URL,
  paymentFonts: { sans: archivoUrl, mono: martianUrl }, // the site's woff2 files
})

// inside a router:
<SiteProvider><App /></SiteProvider>
```

Pages compose the flows: `<Menu />`, `<BookingFlow />`, `<OrderFlow />`,
`<CateringFlow />`, `<PrivacyPolicy />` and so on. The guest pages behind
links in SMS and email need their routes too: `bokning/:locationId/:reservationId`
(`ManageBooking`), `bestallning/:locationId/:orderId` (`OrderStatus`),
`catering/:locationId/:requestId` (`CateringRequest`). See
`site-template/src/App.tsx`.

A fully custom design can skip the components and use the hooks
(`useSite`, `useMenuList`, `useLocationInfo`, `useStickyCart`, `useTheme`)
and the API namespaces (`bookingApi`, `orderApi`, `cateringApi`, ...).

## Theming

Components read CSS variables from `theme.css` (colours `--ink`, `--surface`,
`--accent`..., fonts `--font`/`--mono`, radius `--r-sm`/`--r-md`..., spacing
`--gutter`/`--wrap`), with Booqy's bongrail as the default. Override them in
the site's CSS, loaded after `styles.css`. Light/dark follows the system until
the guest picks one with `ThemeToggle` (`booqy-theme` in localStorage,
`data-theme` on `<html>`); set dark values under both
`@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }` and
`:root[data-theme='dark']`. The restaurant's own colour arrives as
`--tenant-accent*` from `SiteProvider`. Font files (`@font-face`) belong to the
site.

## Install

Published to GitHub Packages (private, BookingSystemAdvancedOrg). A site's
`.npmrc` has `@booqy:registry=https://npm.pkg.github.com`; in Actions the
workflow's `GITHUB_TOKEN` reads it (the repo needs read access to the
package, see the runbook), locally `npm login --registry=https://npm.pkg.github.com`
once with a GitHub token that has `read:packages`.

## Develop

```bash
npm install
npm test        # vitest
npm run lint    # oxlint
npm run build   # types, ESM, site-kit.css to dist/
```

To try a change in a site before releasing it: `npm pack` here and
`npm install ../site-kit/booqy-site-kit-<version>.tgz` in the site (don't
commit that).

## Release

1. On `dev`: the change, a CHANGELOG entry, `npm version <patch|minor|major> --no-git-tag-version`.
2. PR `dev` -> `main`, merge when CI is green.
3. Tag the merge commit on `main`: `git tag v<version> && git push origin v<version>`.
   The Publish workflow tests, builds and publishes that version.

Every site repo gets a Dependabot PR; patch versions merge themselves once
the site's CI is green, minor and major wait for a person. Semver rules are
at the top of CHANGELOG.md.
