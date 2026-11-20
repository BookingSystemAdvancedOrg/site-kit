# @bookingsystemadvancedorg/site-kit

Everything on a restaurant's website that isn't the look: the API client and
tenant resolution, the booking, menu, ordering/checkout (Stripe Elements),
catering, opening hours, GDPR and legal flows, analytics, and hooks for
custom designs. A site (`site-template`, and one private repo `site-<slug>`
per restaurant in BookingSystemAdvancedOrg, created from it) only holds
layout, pages and look. Plan: `application/docs/orchestrator/CUSTOMER-SITES-PLAN.md`.

## Use it in a site

```tsx
// main.tsx
import { SiteProvider, configureSiteKit } from '@bookingsystemadvancedorg/site-kit'
import '@bookingsystemadvancedorg/site-kit/styles.css' // before the site's own CSS
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
`catering/:locationId/:requestId` (`CateringRequest`). Gift cards, events
and the waiting list have their own pages (routes in CHANGELOG 0.3.0, loaders
in `sitePages`). See `site-template/src/App.tsx`.

A fully custom design can skip the components and use the hooks
(`useSite`, `useMenuList`, `useLocationInfo`, `useStickyCart`, `useTheme`)
and the API namespaces (`bookingApi`, `orderApi`, `cateringApi`, ...).

## Languages

Guests can show the whole site in Swedish (default), English, Spanish, Arabic
or Persian. Swedish is the source; the rest is machine translated with Amazon
Translate through `POST /translate` (as `/api/translate` on the site's own
domain, behind the same AWS WAF as the forms) and cached per string for every
site.

- `SiteProvider` has the `LanguageProvider` built in: nothing to wire up. The
  language comes from `?lang=xx`, then the guest's stored choice (`booqy-lang`),
  then Swedish. `<html lang>` and `<html dir>` follow it (`rtl` for ar and fa).
- Put `<LanguagePicker className="site-header-lang" />` in the top bar, at the
  right (after the open-now chip, before the theme toggle; on phones next to the
  burger). It is the kit `Select` with a flag and the code on the button and
  flag, native name and code on each row; `flags={{ fa: <MyFlag /> }}` swaps a
  flag. A ring runs round the flag while translations load.
- Every text node and the `placeholder`, `aria-label`, `aria-description`,
  `alt` and `title` attributes are translated in place (`shared/lang/translator.ts`),
  including portals and the restaurant's own data (menu descriptions,
  categories, about). React keeps working: nodes are never moved or wrapped.
  The first pass hides `#root` (a thin loading bar shows) until the page's
  first data is fetched and translated, at most 2.5 s; cached strings never
  flash. Data a site fetches itself can be translated before it is rendered
  with `await prefetchTexts(texts)` (no text swap, no layout shift).
  Textarea placeholders, iframe titles and the page description in `<head>`
  are translated too. If part of a page could not be translated, the picker
  shows a small dot with a note.
- Mark what must never change with `translate="no"`: the restaurant's name,
  addresses, phone, e-mail, org number, dish names and every guest value you
  show back. The kit already marks its own (dish names, guest data, codes).
  Names in sentences are protected server side: the tenant, location and
  address names automatically, extra ones with `useLanguage().keep(terms)` or
  `useKeepTerms(terms)`.
- Copy a site translated by hand: put `data-lang-own` on its wrapper while that
  language is shown and the translator leaves it alone (`useLanguage().lang`).
- Use logical CSS properties (`margin-inline-start`, `inset-inline-end`,
  `text-align: start`) so Arabic and Persian lay out right to left; the kit's
  styles do. Floor plans and the opening hours table stay left to right.
- Legal pages and the booking terms show `MachineTranslationNote` (hand
  written: the Swedish text applies) with a button back to Swedish.
- Bookings send `language: 'en'` for en, es, ar and fa, so foreign guests get
  the English SMS and e-mail. Stripe's card form follows the language
  (Persian shows English).
- Dates and numbers for a site's own copy: `formatDate`, `formatTime`,
  `formatWeekday`, `formatNumber` (Intl, Latin digits, Gregorian calendar);
  render them inside `translate="no"`.

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

Published to GitHub Packages (BookingSystemAdvancedOrg) as
`@bookingsystemadvancedorg/site-kit`: GitHub's npm registry only takes the
owner's name as the scope. A site's `.npmrc` has
`@bookingsystemadvancedorg:registry=https://npm.pkg.github.com`; in Actions the
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

## Source of truth

`customer-front-end/packages/site-kit/src` is where guest-site changes are
made today; this repo's `src/` must match it, and `src/vendor/brand` must
match `customer-front-end/packages/brand/src` (`@booqy/brand` is not
published, so it is bundled from there). Check before a release:

```bash
npm run sync:check -- ../customer-front-end
```

## Release

1. On `dev`: the change, a CHANGELOG entry, `npm version <patch|minor|major> --no-git-tag-version`.
2. PR `dev` -> `main`, merge when CI is green.
3. Tag the merge commit on `main`: `git tag v<version> && git push origin v<version>`.
   The Publish workflow tests, builds and publishes that version.

Every site repo gets a Dependabot PR; patch versions merge themselves once
the site's CI is green, minor and major wait for a person. Semver rules are
at the top of CHANGELOG.md.
