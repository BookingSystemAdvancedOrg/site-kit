# Changelog

All notable changes to `@bookingsystemadvancedorg/site-kit`. Semver: removing or renaming
anything exported from `index.ts`, `testing.ts` or `styles.css` (including a
CSS variable or class name a site styles) is a major version.

## 0.3.0 (2026-11-17)

Caught up with `customer-front-end/packages/site-kit` (origin/dev bf3e23f,
2026-11-17). The live restaurant sites build from this package, so these
changes, made in the customer copy from 2026-10-28 on, never reached them.
`src/` is now identical to the customer copy apart from the package name and
one test (`npm run sync:check` shows it).

New for guests (each behind its plan feature, see Routes below):

- Presentkort: buy a gift card (`/presentkort`), check the balance
  (`/presentkort/saldo`), and pay part or all of an order with one
  (`GiftCardField` in Beställ; a card covering the order skips Stripe).
- Evenemang: list and detail (`/evenemang`, `/evenemang/:eventId`), buy
  tickets, Wallet buttons and resale on `/biljett`, receive a ticket on
  `/biljett/ta-emot`.
- Kö: join the waiting list on `/ko` when `location.waitlist.publicJoin`.
- Menu: the restaurant's own categories (not just the four defaults),
  allergens, add-ons (`OptionPicker`, priced per choice, sent to the kitchen
  ticket), dish photos cropped at the restaurant's focal point, load retry.
- `KassanPage`: an old table QR code (`/bestall?bord=...`) says "Beställ och
  betala i kassan" with links to the menu and booking.

Fixes from the 2026-11-14 to 2026-11-17 guest site audits: failed fields get
focus, Swedish fallback errors that say who acts (with the restaurant's
phone), the late-cancel fee checkbox, the opening hours dialog focus, Stripe
loads only at payment, storage names on the cookie page, catering errors per
field (date, time, notes) and the Scrive signing "try again", the calendar
next to its field and keyboard focus, form fields inside their cards at every
width, 44 px tap targets and dishes that fit at 320 px, the checkout button
above the footer on phones and tablets, and the status page keeping the
pickup/table line.

Look: branded dropdowns (`Select`, never the OS menu), skeletons while pages
load (`SkelCard`), the click sound (`SoundToggle`, `installSound`), the theme
switch sweep (`switchTheme`), the Booqy palette in the default styles and the
Stripe form (`paymentFonts.sansFamily`).

New exports: `KassanPage`, `isTableQrLink`, `Select`, `SELECT_SHEET_QUERY`,
`SoundToggle`, `installSound`, `setSound`, `soundOn`, `useSound`,
`sitePages` (lazy loaders for every page), `SkelCard`, `allergenText`,
`DEFAULT_CATEGORIES`, `getPublicMenuWithCategories`, `menuImagePosition`,
`GIFT_CARD_PURCHASE_KEY`, `SOUND_KEY`, `TICKET_PURCHASE_KEY`,
`WAITLIST_TOKEN_PREFIX` and the types `MenuCategoryEntry`, `OptionGroup`,
`LocationWaitlist`, `SiteFeatureKey`, `SiteSlotId`, `Select*`.

`@booqy/brand` (Booqy's components: `Bar`, `Button`, `Printing` ...) is not
published, so its source is in `src/vendor/brand` and bundled into `dist/`;
its styles are in `site-kit.css` (all `bq-` classes and `--bq-` variables, so
nothing collides with a site's own CSS). No new dependency for sites.

Breaking (types and behaviour; nothing removed from `index.ts`):

- Ordering at the table is gone: `/bestall` is pickup only and
  `/bestall?bord=<code>` belongs on `KassanPage` (`isTableQrLink`).
  `OrderRequest.mode` is `'pickup'`, `getOrdering(locationId)` takes no table
  code, `OrderingState.table`/`forTable`, `SiteLocation.ordering.table` and
  the `order-table-code` storage are removed.
- `MenuCategory` is now `string` (a `categoryId`), `CATEGORY_LABEL` is
  `Record<string, string>` and `PublicMenuItem.imageKey` can be `null`.
  `useMenuList()` returns `categories` and `retry`, `filter` is a string.
- `OrderCreated.clientSecret`/`stripeAccount` are optional (missing when a
  gift card pays everything).
- The default styles follow the Booqy look of the guest site, so a site
  without its own overrides looks different.

Sites: add the routes for the new pages (as `customer-front-end/src/App.tsx`):
`presentkort`, `presentkort/saldo` (`features.giftCards`), `ko`
(`features.waitlist` and `location.waitlist.publicJoin`), `evenemang`,
`evenemang/:eventId`, `biljett`, `biljett/ta-emot` (`features.events`), and
route `/bestall?bord=` to `KassanPage`.

## 0.2.0 (2026-11-17)

- Bot check moved from Cloudflare Turnstile to AWS WAF. Breaking:
  `TurnstileWidget` is removed, and `SiteConfig.turnstile` is replaced by
  the optional `botCheck` (`{ integrationUrl }`). The API client loads the
  WAF script in the background and sends the guarded form posts (booking,
  table hold, order, catering request, offer signup, gift cards, event
  tickets, waitlist) to `/api` on the site's own domain (CloudFront,
  infrastructure network/waf-sites) with the `aws-waf-token` cookie; no
  widget and no token field. New errors `bot_check_unavailable` and
  `bot_check_failed` get Swedish guest copy, and the cookie page lists
  `aws-waf-token` instead of Turnstile. Nothing to change in a site except
  removing any direct `TurnstileWidget` use.
- Phone numbers: a Swedish mobile number typed without the 0 ("70 174 06 05")
  becomes +46701740605 in `PhoneInput`/`toE164` and is accepted by
  `normalizePhone`, which now lives in `shared/phone` and also refuses
  Swedish numbers of the wrong length (same rules as the server). New
  `formatPhoneNational` ("070-174 06 05"), `phoneHref` ("tel:+46701740605")
  and `PhoneLink`; the guest pages (also the privacy policy contact) show
  restaurant numbers that way. 010 and 020 numbers get a 2-digit prefix,
  and only the mobile series (070, 072, 073, 076, 079) are split as 07x, so
  "+46771123456" shows as "0771-12 34 56".
- No pure white (owner, 2026-11-13): every white in the styles, Stripe field
  fallbacks and QR codes is off-white (#fdfaf6). `textOn` and `accentPair`
  measure text contrast against that off-white and return `#fdfaf6` instead
  of `#ffffff`, so a few mid-tone restaurant colours now get near-black text.

## 0.1.0 (2026-10-27)

First version, extracted from `customer-front-end` with no visible change to
the site.

- API client (`apiGet`/`apiPost`/`apiDelete`, retries, `ApiError`) and tenant
  resolution (`SiteProvider`, `useSite`, `siteQuery`, `getSiteConfig`).
- Settings through `configureSiteKit` (API URL, dev tenant slug, menu image
  CDN, payment font files) instead of `import.meta.env`.
- Flows: `Menu`, `BookingFlow`, `ManageBooking`, `OrderFlow` (cart and
  checkout with Stripe Elements), `OrderStatus`, `CateringFlow`,
  `CateringRequest`, `OfferCard`.
- Building blocks: `OpeningHoursModal`, `AddToCalendar`, `DateInput`,
  `PhoneInput`, `FlowSteps`, `ThemeToggle`, `PaymentTicket`, floor plans.
- GDPR and legal: `GuestDataNotice`, `MarketingConsent`, `PrivacyPolicy`,
  `CookiePolicy`, `BookingTermsPage`, `STORAGE_REGISTRY`.
- Hooks for custom designs: `useSite`, `useLocationInfo`, `useMenuList`,
  `useStickyCart`, `useTheme`; API clients as namespaces (`bookingApi`,
  `orderApi`, `cateringApi`, `menuApi`, `offerApi`, `layoutApi`).
- Analytics: `trackPage`, `trackOfferView`, attribution.
- `styles.css`: the components' default look (Booqy's bongrail), driven by
  CSS variables in `theme.css` with light and dark mode.
- `@bookingsystemadvancedorg/site-kit/testing`: `WithSite`, `siteConfig`, `json` for site tests.
