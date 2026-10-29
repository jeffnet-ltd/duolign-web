// Product clips beside the landing page's sections (2026-10-29): short,
// silent loops of the app's interface made with the app's own motion
// graphics (Couple_finance_app content-engine, "Web-" compositions).
//
// Each <figure class="clip" data-clips="a b"> plays its clips in turn, in
// the visitor's light or dark theme (following theme.js). A clip only loads
// once it scrolls into view, plays while it's on screen, and has a pause
// button (anything moving for more than five seconds needs one). With
// reduce motion on, the still poster shows and nothing plays until asked.
(function () {
  var root = document.documentElement
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var PAUSE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
  var PLAY = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>'

  function theme() {
    var set = root.getAttribute('data-theme')
    if (set === 'light' || set === 'dark') return set
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  function setup(fig) {
    var names = fig.getAttribute('data-clips').split(' ')
    var video = fig.querySelector('video')
    var btn = fig.querySelector('.clip-toggle')
    var i = 0
    var loaded = false
    var userPaused = reduce
    var onScreen = false

    function src(name) { return 'assets/clips/' + name + '-' + theme() + '.mp4' }
    function poster(name) { return 'assets/clips/' + name + '-' + theme() + '.jpg' }
    function show() {
      video.poster = poster(names[i])
      if (loaded) { video.src = src(names[i]); video.load() }
    }
    function sync() {
      btn.innerHTML = userPaused ? PLAY : PAUSE
      btn.setAttribute('aria-label', userPaused ? 'Play animation' : 'Pause animation')
      if (onScreen && !userPaused) {
        if (!loaded) { loaded = true; video.src = src(names[i]) }
        var p = video.play()
        if (p && p.catch) p.catch(function () {})
      } else {
        video.pause()
      }
    }

    // One clip loops; two or more take turns.
    video.loop = names.length === 1
    video.addEventListener('ended', function () {
      i = (i + 1) % names.length
      show()
      sync()
    })
    btn.addEventListener('click', function () { userPaused = !userPaused; sync() })

    show()
    sync()
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting
        sync()
      }, { threshold: 0.3 }).observe(fig)
    } else {
      onScreen = true
      sync()
    }
    return function () { show(); sync() }
  }

  function start() {
    var refresh = Array.prototype.map.call(document.querySelectorAll('figure.clip'), setup)
    function all() { refresh.forEach(function (f) { f() }) }
    // Follow the theme: the toggle sets data-theme; otherwise the device decides.
    new MutationObserver(all).observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)')
      if (mq.addEventListener) mq.addEventListener('change', all)
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
