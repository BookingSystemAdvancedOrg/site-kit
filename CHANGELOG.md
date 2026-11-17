# Changelog

All notable changes to `@bookingsystemadvancedorg/site-kit`. Semver: removing or renaming
anything exported from `index.ts`, `testing.ts` or `styles.css` (including a
CSS variable or class name a site styles) is a major version.

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
