/* theme + language before first paint (same localStorage key as the old pages: dgit-prefs) */
(function () {
  var d = document.documentElement, p = {};
  try { p = JSON.parse(localStorage.getItem('dgit-prefs') || '{}'); } catch (e) {}
  var t = p.theme === 'light' || p.theme === 'dark' ? p.theme : 'system';
  var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  d.classList.toggle('dark', dark);
  var l = p.lang === 'en' || p.lang === 'zh' ? p.lang : ((navigator.language || '').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en');
  d.lang = l === 'zh' ? 'zh-CN' : 'en';
})();
