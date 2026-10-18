export type Theme = 'dark' | 'light'
export const THEME_STORAGE_KEY = 'auratrade-theme'

// Runs in <head> before the first paint. Only validated enum values reach the DOM;
// blocked browser storage falls back to the default without preventing rendering.
export const themeBootstrap = `(() => {
  let theme = 'dark';
  try { if (localStorage.getItem('${THEME_STORAGE_KEY}') === 'light') theme = 'light'; } catch {}
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
})();`

/** Canvas cannot resolve CSS variables itself. Read the same tokens as the DOM. */
export function readChartColors() {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string) => style.getPropertyValue(`--${name}`).trim()
  return {
    background: token('background'), text: token('muted-foreground'),
    border: token('border'), input: token('input'), grid: token('chart-grid'),
    primary: token('primary'), profit: token('profit'), loss: token('loss'),
    first: token('chart-1'), second: token('chart-2'), third: token('chart-3'),
    fourth: token('chart-4'), watermark: token('chart-watermark'),
  }
}
