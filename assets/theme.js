// Light/dark choice, the same way the app does it: follow the visitor's
// device until they pick, then remember their pick. Loaded in <head> so the
// stored theme is set before the first paint (no flash of the other theme).
(function () {
  var KEY = 'duolign-theme'
  var root = document.documentElement
  var stored = null
  try { stored = localStorage.getItem(KEY) } catch (e) {}
  if (stored === 'light' || stored === 'dark') root.setAttribute('data-theme', stored)

  function current() {
    var set = root.getAttribute('data-theme')
    if (set === 'light' || set === 'dark') return set
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  var SUN = '<svg width="18" height="18" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="butt" stroke-linejoin="miter"><path d="M14.9 9.24A4 4 0 1 1 13.6 8.33"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.75 1.75M16.95 16.95l1.75 1.75M5.3 18.7l1.75-1.75M16.95 7.05l1.75-1.75"/></svg>'
  var MOON = '<svg width="18" height="18" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="butt" stroke-linejoin="miter"><path d="M20 14.6A8.5 8.5 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"/></svg>'

  function render(btn) {
    var dark = current() === 'dark'
    // The icon shows the theme you'd switch to.
    btn.innerHTML = dark ? SUN : MOON
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode')
    btn.title = dark ? 'Light mode' : 'Dark mode'
  }

  function mount() {
    var bar = document.querySelector('header .bar')
    if (!bar || bar.querySelector('.theme-toggle')) return
    var btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'theme-toggle'
    render(btn)
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark'
      root.setAttribute('data-theme', next)
      try { localStorage.setItem(KEY, next) } catch (e) {}
      render(btn)
    })
    // Sits just before the waitlist button, grouped with it on the right.
    var cta = bar.querySelector('.bar-cta')
    var end = document.createElement('div')
    end.className = 'bar-end'
    if (cta) { bar.insertBefore(end, cta); end.appendChild(btn); end.appendChild(cta) } else { bar.appendChild(end); end.appendChild(btn) }
    // Following the device: keep the icon right if the device switches.
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)')
      var onChange = function () { render(btn) }
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange)
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
  else mount()
})()
