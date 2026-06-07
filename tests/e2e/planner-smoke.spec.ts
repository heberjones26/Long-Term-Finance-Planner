import { expect, type Locator, type Page, test } from "@playwright/test";

type Destination = {
  label: string;
  navName: RegExp;
  evidence: RegExp;
};

const destinations: Destination[] = [
  {
    label: "Cost of Living",
    navName: /cost\s+of\s+living/i,
    evidence: /cost\s+of\s+living|housing|rent|utilities|expenses|inflation/i
  },
  {
    label: "Periods",
    navName: /periods?|timeline|life\s+phase|phases/i,
    evidence: /periods?|timeline|life\s+phase|phases|working\s+years|retirement\s+period/i
  },
  {
    label: "Goals",
    navName: /goals?/i,
    evidence: /goals?|target|milestone|progress|retirement\s+goal|savings\s+goal/i
  },
  {
    label: "What-If",
    navName: /what-if/i,
    evidence: /what-if\s+lab|projection\s+comparison|controls/i
  },
  {
    label: "Settings",
    navName: /settings|preferences/i,
    evidence: /settings|preferences|assumptions|currency|inflation|profile/i
  }
];

test.describe("Long-Term Finance Planner smoke", () => {
  test("loads the dashboard with projection and goal content", async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await page.goto("/");

    await expect(appSurface(page)).toBeVisible();
    expect(await firstVisible(pageContent(page).getByText(/dashboard|planner|long[-\s]?term finance/i))).not.toBeNull();
    expect(await firstVisible(pageContent(page).getByText(/projection|forecast|projected|net worth|cash\s*flow/i))).not.toBeNull();
    expect(await firstVisible(pageContent(page).getByText(/goals?|target|milestone/i))).not.toBeNull();
    expect(pageErrors, "the app should not throw while loading").toEqual([]);
  });

  test("core navigation reaches each planning section", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.toLowerCase().includes("mobile"), "covered by the mobile navigation test");

    await page.goto("/");

    for (const destination of destinations) {
      await test.step(`navigate to ${destination.label}`, async () => {
        await openNavigationIfNeeded(page, destination.navName);
        await clickNavigationItem(page, destination.navName);
        await expect(sectionEvidence(page, destination)).toBeVisible();
      });
    }
  });

  test("mobile viewport exposes usable navigation", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.toLowerCase().includes("mobile"), "covered by the mobile Playwright project");

    await page.goto("/");

    await expect(
      page
        .getByRole("navigation")
        .or(page.getByRole("button", { name: /menu|navigation|open/i }))
        .first()
    ).toBeVisible();

    for (const destination of destinations) {
      await test.step(`navigate to ${destination.label}`, async () => {
        await openNavigationIfNeeded(page, destination.navName);
        await clickNavigationItem(page, destination.navName);
        await expect(sectionEvidence(page, destination)).toBeVisible();
      });
    }
  });

  test("what-if lab updates when an item override changes", async ({ page }) => {
    await page.goto("/what-if");

    await expect(page.getByRole("heading", { name: /what-if lab/i })).toBeVisible();
    await expect(page.getByText(/baseline/i).first()).toBeVisible();

    await page.getByRole("button", { name: /col item/i }).click();
    await page.getByLabel(/cost-of-living override amount/i).fill("1250");

    await expect(page.getByText(/1 item edit/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /apply to plan/i })
    ).toBeEnabled();
  });
});

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(error.message));

  return errors;
}

function appSurface(page: Page): Locator {
  return page.locator("main").first();
}

function pageContent(page: Page): Locator {
  return page.locator("main").first();
}

function sectionEvidence(page: Page, destination: Destination): Locator {
  const sectionContent = page.locator("main").first();

  return page
    .getByRole("heading", { name: destination.evidence })
    .or(sectionContent.getByText(destination.evidence))
    .first();
}

async function openNavigationIfNeeded(page: Page, navName: RegExp): Promise<void> {
  if (await firstVisible(navigationItem(page, navName))) {
    return;
  }

  const menuButton = page
    .getByRole("button", { name: /menu|navigation|open/i })
    .or(page.getByLabel(/menu|navigation|open/i))
    .or(page.locator("[aria-controls*='nav' i], [data-testid*='menu' i], [data-testid*='nav' i]"))
    .first();

  const visibleMenuButton = await firstVisible(menuButton);
  expect(visibleMenuButton).not.toBeNull();
  await visibleMenuButton!.click();
  expect(await firstVisible(navigationItem(page, navName))).not.toBeNull();
}

async function clickNavigationItem(page: Page, navName: RegExp): Promise<void> {
  const item = await firstVisible(navigationItem(page, navName));

  expect(item).not.toBeNull();
  await item!.click();
}

function navigationItem(page: Page, navName: RegExp): Locator {
  return page
    .getByRole("link", { name: navName })
    .or(page.getByRole("button", { name: navName }));
}

async function firstVisible(locator: Locator): Promise<Locator | null> {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) {
      return candidate;
    }
  }
  return null;
}
