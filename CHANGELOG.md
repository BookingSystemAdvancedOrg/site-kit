# Changelog

All notable changes to `@bookingsystemadvancedorg/site-kit`. Semver: removing or renaming
anything exported from `index.ts`, `testing.ts` or `styles.css` (including a
CSS variable or class name a site styles) is a major version.

## 0.6.2 (2026-11-28)

- Order menu on phones (480 px and below): a dish row with the "Ej för
  avhämtning" badge puts the badge under the text, so the dish name and
  description keep their width (they were squeezed to 17 px at 320 px).

## 0.6.1 (2026-11-24)

- Guest payments offer only card (Visa, Mastercard; Apple Pay and Google
  Pay as card wallets), Swish and Klarna; the server turns off anything
  else a restaurant's Stripe account has on (Amazon Pay, Link ...).
- The order pay step names only methods the payment actually offers: the
  redirect hint reads the order response's new optional `methods`
  (Stripe's types on the session, e.g. `['card', 'swish']`) and says
  "Med Swish kan du skickas vidare ...", "Med Klarna ..." or "Med Swish
  eller Klarna ...". Card only, or no list from the server (older API):
  "Ibland skickas du vidare en kort stund för att godkänna betalningen.",
  no method named. `OrderCreated` has the optional `methods`.
- Gift card and event pay steps no longer speak of the card only (their
  payments can also offer Swish and Klarna): the default `SecureNote`,
  "Betalningen är inte tillgänglig just nu." / "Betalningen svarar inte
  just nu ..." and "Försök igen, gärna med ett annat betalsätt.".
- `PaidWith`: an older payment with Amazon Pay, Revolut Pay or MobilePay
  (no longer offered) reads "Betald med Amazon Pay" and so on instead of
  nothing; `PaidWithMethod` has `amazon_pay`, `revolut_pay`, `mobilepay`.

## 0.6.0 (2026-11-24)

- Payment methods: orders and private catering pay with card (Visa,
  Mastercard), Apple Pay, Google Pay, Swish or Klarna; the table booking
  card guarantee takes card, Apple Pay or Google Pay. No PayPal.
- `PaymentTicket` / `PaymentPanel`: "Betalt" is stamped only when Stripe
  says the session is complete and paid (or needs no payment). Complete but
  unpaid (a method still settling) shows "Betalningen behandlas" without the
  green stamp or confetti, then hands over to the status page as before.
  `onPaid` now gets `'paid'` or `'processing'` (a callback without the
  argument still works); `PayStatus` has an optional `processing`.
  `PaidStamp` takes `pending` for the processing look (`.pay-done.is-pending`).
  The catering request page shows the same processing stamp after a
  redirect back (`?betalning=klar`) until the webhook confirms; "Betalt"
  only when Stripe said paid on the page.
- Payment Element: on screens below 768 px the methods are a radio list
  (accordion), tabs from 768 px; chosen when the form is drawn. Apple Pay
  and Google Pay explicitly `auto`, Link stays off (also in `GuaranteeStep`).
- Copy without "kort" where Swish or Klarna are possible: `SecureNote`
  default and the order pay step ("Dina betaluppgifter går direkt dit"),
  the catering offer ("Betalas här på sidan direkt efter signering") and
  form ("Du betalar online"), the order status page (failed payment; a
  cancelled order's refund goes back "till ditt kort", "via Swish, oftast
  inom några minuter" or "via Klarna", as the receipt e-mail says). The guarantee intro
  says Apple Pay and Google Pay work too.
- How the guest paid: `orderApi.GuestOrder` and `cateringApi.GuestRequest`
  have `paidWith?` (`{ method, brand?, last4? }`). The order status page and
  a paid private catering request show "Betald med Swish", "Betald med Visa
  ****4242" or "Betald med Apple Pay" under the total (`.paid-with`, the
  name with `translate="no"`). Labels in `shared/payment/paidWith.ts`, the
  same as the receipt e-mail.
- Order status, waiting for payment: "Oftast några sekunder, ibland
  längre." (Klarna can take longer than a few seconds).
- Sites that use `PaymentPanel` with their own button: `PayStatus.paid` is
  now only true once Stripe says paid; check `PayStatus.processing` too to
  hide the button while a method settles. `PayOutcome` and `PaidWith` are
  exported for typing `onPaid` and the API's `paidWith`.
- Order page: a payment still settling no longer empties the cart (the
  status page does that once it sees it paid), so "Försök igen" after a
  declined method keeps the food.
- A cancelled order whose refund came back (`refundIssue` from the API,
  Swish declined it): the status page says the restaurant pays back another
  way instead of promising the method.
- Catering request page: after three minutes without a confirmation the
  Betala button comes back with a short note (a declined Swish or Klarna
  payment also returns with `?betalning=klar`); it no longer waits forever.
- "Betald med kort" is one text node, so the page translator gets the whole
  phrase.

- Booking page (`BookingFlow`): a table id is never shown. The table chips,
  the hold banner, the "Ditt bord" line, the receipt, the reason texts and
  the combination note name a table by the label the API sends for the
  slot's own layout version (availability `label`, the hold's and booking's
  `tableLabels`), then by its label from the active layout, then neutrally
  ("Ett bord", "Bordet", "2 bord"). So a slot after a scheduled layout
  cutover shows the number the staff email and the admin show, and the plans
  draw the same numbers as the chips. The receipt leaves out the Bord row
  when a label is unknown.
- Floor plans number tables over all floors, as the list, the receipt, the
  admin and the staff email do (floor 2 no longer starts again at "Bord 1"):
  new optional `labels` prop on `FloorPlanSvg` and `FloorPlan3D`. Without it
  they number the floor on its own as before.
- A table's own name is shown as it is ("Bar", not "Bord Bar"), also in the
  plans' aria-labels and tooltips, the reason texts ("Terrassen har redan en
  bokning kl 18:00") and the order status sentences ("Vi serverar vid Bar",
  "vid bord 3", else "vid ditt bord").
- Reads the new optional API fields: `label` on availability tables and
  unavailable tables, `tableLabels` on holds and guest reservations. Works
  against an older API too (layout labels, then the neutral text).

## 0.5.1 (2026-11-21)

- `MarketingConsent`: the checkbox only has `aria-controls` while the channel
  choice it points at is on the page (ticked, more than one channel). Before,
  it pointed at a missing id, which axe reports as critical
  (aria-valid-attr-value).
- `DateInput`: on touch screens and below 1024 px the calendar button is
  44 x 44 px (was 32 px), as are the calendar's month arrows. Same icon; the
  field keeps room for it.
- `DateInput` calendar: weekday headers in the site language from `Intl`
  (one letter in Arabic and Persian, three in English and Spanish) with
  `translate="no"`. Before, the page translator wrote full Arabic and Persian
  day names that pushed Sunday out of the calendar.

## 0.5.0 (2026-11-21)

First release after 0.3.0 (0.4.0 below was never published), so sites move
from 0.3.0 straight to 0.5.0 and get both sections.

- Checkboxes (`.booking-check`) are visible before hover again: they draw
  their border and fill from `--ink` instead of `--control-bg` and
  `--control-line`, which no theme defined. Sites can delete their checkbox
  override.
- Removed: the `.pay-back` class (from `styles.css` and the markup) and the
  checkbox variables `--control-bg` and `--control-line`. No site used them.

- Languages: Swedish (default), English, Spanish, Arabic and Persian on every
  site. `SiteProvider` now includes `LanguageProvider`; new exports
  `LanguagePicker`, `LanguageProvider`, `useLanguage`, `useKeepTerms`,
  `LANGUAGES`, `PICKER_LABEL`, `DEFAULT_LANG`, `isLang`, `currentLang`, `Flag`,
  `MachineTranslationNote`, `formatDate`, `formatTime`, `formatWeekday`,
  `formatNumber`, `LANG_KEY` and the types `Lang`, `Language`,
  `LanguageContextValue`. See README "Languages".
- The page translator (`shared/lang/translator.ts`) translates text and the
  `placeholder`, `aria-label`, `aria-description`, `alt` and `title`
  attributes in place through `POST /translate` (`/api/translate` behind the
  WAF: added to the guarded paths), with memory and `sessionStorage` caches
  (`booqy-lang-cache:{språk}`). `booqy-lang` (localStorage) holds the choice;
  Anar's `anar-lang` is moved over once. Both keys are in the storage registry.
- `Select`: optional `valueLabel` (button content), `listLabel` (list name and
  sheet title), `noTranslate` and `align` ('end' anchors the list to the
  button's end edge; the list also follows `dir="rtl"`).
- `translate="no"` on dish names, cart and order lines, codes, the
  restaurant and location names the kit draws, `PhoneLink` (also `dir="ltr"`),
  `Plate` and every guest value shown back (manage booking, order status,
  checkout, catering request, tickets). Floor plans and the opening hours
  table are `dir="ltr"`.
- RTL: the kit's and the vendored brand styles use logical properties
  (`margin-inline-*`, `padding-inline-*`, `inset-inline-*`, `text-align:
  start/end`, `border-inline-*`); back arrows and progress bars flip in RTL.
  New stylesheet `styles/lang.css` (picker, flags, note, pending state).
- Legal pages and `GuaranteeTermsText` show `MachineTranslationNote` outside
  Swedish. Bookings send `language: 'en'` for en, es, ar and fa; Stripe's
  locale follows the language (fa falls back to en).
- Live test fixes: the first-load veil now lasts until the page's first data
  (menu, catering) is fetched and translated, at most 2.5 s, with a thin
  loading bar (`.lang-veil-bar`); menu and catering data are translated before
  they are rendered (new export `prefetchTexts`), so no text is swapped in
  front of the guest (layout shift in ar and fa). Textarea placeholders, iframe
  titles (not Stripe or the WAF) and the page description in `<head>`
  (`meta[name=description]`, `og:title`, `og:description`) are translated.
  Clock times are sent as a template, so a countdown ("Bordet hålls i 14:59")
  is one translation; "kl" before a time is dropped outside Swedish. The
  picker shows a small dot and a hand-written note (`PARTIAL_NOTE`) when part
  of the page could not be translated. Split sentences joined (hold banner,
  booking summary, booking length, queue offer, last order, restaurant name
  sentences); catering dish lists in packages are `translate="no"`; catering
  prices read "per portion" and "per gäst"; the booking date tiles show the
  weekday and month in the guest's language (Intl, `translate="no"`); "Till
  slutet av dagen" in the storage list is reworded so it translates.
- Booking: "Fler än 12 personer? Ring ..." is one text node before the phone
  link (and one sentence without a phone), so it is translated as a whole.
- Booking horizon: the date list runs from today through today + 21 days,
  whole days in the restaurant's time zone (22 dates; it was 21, today to
  today + 20), the same rule as the server, which now accepts every time on
  the last day. New export `bookingApi.BOOKING_HORIZON_DAYS` (21);
  `bookableDates(today)` returns 22 dates by default (the optional second
  argument is still the number of dates). The "more than N days ahead"
  refusal reads "Det går att boka högst N dagar fram." with N from the server.

## 0.4.0 (2026-11-18)

- Table picker (step 3, 2D and 3D): tables that can be booked for the party
  are warm and light and breathe slowly (2.4 s, all in step); tables of the
  wrong size are dimmed and their title and tap say "För litet bord för 6" /
  "För stort bord för 2"; booked is muted red; the chosen table is filled and
  lifts. The legend matches. Picking a table (on the plan or its button) pops
  it, sends a ring out from it and lights its button for 0.5 s; then the page
  glides (about 0.6 s, eased) to Bekräfta bord and focus moves there. After
  the hold the page glides to the steps and focus moves to "Dina uppgifter".
  No animation with reduced motion. New colour tokens `--seat-free-hi`,
  `--seat-glow`, `--seat-ring`, `--seat-free-ink` (dark text on the light tables) (with the existing `--seat-*`); the state
  rules live in `styles/table-picker.css`. Tables carry `data-table-id`.
- Card guarantee for a booking made by phone: the guest's SMS links to
  `/bokning/<plats>/<id>#<token>`, and while the booking is `pending` with
  `setup` in the guest view, `ManageBookingPage` shows the same card step as
  the booking flow (`GuaranteeStep`, with the booking's details above the
  terms): "0 kr dras nu." and the fees for the party from the booking's
  `guarantee` snapshot. Stripe's `return_url` is the same manage page, which
  finishes the booking (`POST .../confirm` with the manage token) and shows
  the saved card guarantee. The hold time is the real time left from
  `setup.expiresAt` (falls back to `pendingExpiresAt`), so a 30 min phone hold
  reads right. Pending without `setup` keeps "Bokningen blev inte klar",
  except with `setupUnavailable` while the hold still runs (Stripe could not
  be asked): then "Kortformuläret kunde inte hämtas just nu", the time the
  table is held until and "Försök igen". Back from a failed or cancelled
  3-D Secure (`redirect_status` not `succeeded`) the card form shows the
  bank error; Stripe's query parameters are removed from the address.
- `GuaranteeStep` takes optional `children`, shown under its intro, and
  `initialError`, shown at the card form.
- `GuestReservation`: `setup` is documented for the manage page too; new
  optional `pendingExpiresAt` and `setupUnavailable`.
- `NOTHING_CHARGED` is now "0 kr dras nu." (card step, `GuaranteeNotice`,
  terms list while pending).
- `BackButton` from customer-front-end (origin/dev d7b9c3d): one secondary
  pill with an arrow for order checkout, cart edit, payment and the catering
  offer.

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
