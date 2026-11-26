// #1367: click the visible tree selector in the active screen instead of the removed header control.
export async function clickToolbarTreeChoice(page) {
  const choice = page.frameLocator('iframe#view').locator('button.lt-toolbar-tree-choice');
  if (!(await choice.isVisible().catch(() => false))) {
    await page.locator('[data-view="track32-bookshelf.html"]').first().evaluate(button => button.click());
  }
  await choice.click();
}
export async function treeChoiceExpanded(page) {
  return page.frameLocator('iframe#view').locator('button.lt-toolbar-tree-choice').getAttribute('aria-expanded');
}
export async function treeChoiceFocused(page) {
  return page.frameLocator('iframe#view').locator('button.lt-toolbar-tree-choice').evaluate(button => document.activeElement === button);
}
