import { test, expect, openView } from './fixtures'

test('a view keeps its state while another view is shown', async ({ page }) => {
  await page.goto('/?starter')
  const sounds = await openView(page, 'Sounds')
  await sounds.getByLabel('Sound name', { exact: true }).fill('Kept while hidden')
  await openView(page, 'Mixer')
  await expect(sounds).toBeHidden()
  await openView(page, 'Sounds')
  await expect(sounds.getByLabel('Sound name', { exact: true })).toHaveValue('Kept while hidden')
})
