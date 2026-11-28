/**
 * @bookingsystemadvancedorg/site-kit/testing: testhjälp för sajtens egna tester. WithSite
 * renderar under en router och en färdig restaurang (siteConfig()), utan
 * nätverk; json() bygger ett fetch-svar. guestChangeFake() är en falsk
 * backend för bokningssidan med Ändra bokning (vitest och Playwright).
 */
export { WithSite } from './test/siteFixture'
export * from './test/siteData'
export { guestChangeFake } from './test/guestChange'
export type { FakeAnswer, GuestChangeFakeOptions } from './test/guestChange'
