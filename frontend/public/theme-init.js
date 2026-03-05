// FOUC (Flash of Unstyled Content) guard
// Applies theme class synchronously before React hydration to prevent visual flicker
(() => {
  try {
    const saved = localStorage.getItem('ui.theme'); // 'light'|'dark'|'system'|null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const finalTheme = saved === 'light' || saved === 'dark' ? saved : (prefersDark ? 'dark' : 'light');
    document.documentElement.classList.add(finalTheme);
  } catch {
    // Silent fail for localStorage issues (private browsing, etc.)
  }
})();
