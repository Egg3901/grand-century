import { test, expect } from "@playwright/test";
test("moving and removing formations updates native counters without stale projection crashes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/tests/native-graphics/index.html?units");
  const before = await page
    .getByRole("button", { name: /army:.*regiments in/ })
    .first()
    .getAttribute("aria-label");
  await page
    .getByRole("button", { name: "Move visible formation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: before!, exact: true }),
  ).toHaveCount(0);
  const moved = page
    .getByRole("button", { name: /army:.*regiments in/ })
    .first();
  const caption = await moved.getAttribute("aria-label");
  await moved.click();
  await expect(page.getByRole("status")).toHaveText(
    `Selected: ${caption!.split("regiments in ")[1]}`,
  );
  await page
    .getByRole("button", { name: "Remove formations", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /army:.*regiments in/ }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
