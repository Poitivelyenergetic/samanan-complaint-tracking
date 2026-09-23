/*!
 * samnan-spinner - a drag-to-rotate 360 view of the Samnan Star-high SHC50 pump.
 *
 * 72 frames rendered in Blender (Cycles/OptiX), 5 degrees apart, on a TRANSPARENT
 * background - so it composites onto whatever colour the host page uses rather than
 * carrying a baked-in backdrop.
 *
 * No dependencies, no build step, ~4KB.
 *
 *   <div data-samnan-spinner data-frames="/assets/samnan-spinner/frames"></div>
 *   <script src="/assets/samnan-spinner/samnan-spinner.js" defer></script>
 *
 * or explicitly:
 *
 *   SamnanSpinner.mount(el, { frames: '/assets/samnan-spinner/frames' });
 *
 * Behaviour: idles in a slow spin, drag to turn it yourself, flick to send it
 * spinning faster, and it eases back to the idle spin a moment after you let go.
 *
 * Accessibility: honours prefers-reduced-motion by not auto-spinning (dragging still
 * works), is keyboard-reachable, and arrow keys step it round.
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    frames: 'frames',     // directory holding f00.webp .. f71.webp
    count: 72,
    secondsPerTurn: 14,   // idle spin: slow on purpose, it is background furniture
    dragTurns: 0.9,       // how much of a full turn one drag across the width gives
    lazy: true,           // wait until it scrolls into view before fetching frames
    label: 'Samnan Star-high SHC50 pump, rotatable 360 degrees'
  };

  function mount(el, opts) {
    if (!el || el.__samnanSpinner) return null;
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    if (opts) for (var j in opts) o[j] = opts[j];
    if (el.dataset.frames) o.frames = el.dataset.frames;
    if (el.dataset.count) o.count = parseInt(el.dataset.count, 10) || o.count;
    el.__samnanSpinner = true;

    var N = o.count;
    var reduce = global.matchMedia &&
                 global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------------------------------------------------------------- DOM
    var cv = document.createElement('canvas');
    cv.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';
    el.appendChild(cv);
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', o.label);
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    var ctx = cv.getContext('2d');

    var imgs = new Array(N), loaded = 0, ready = false;
    var frame = 0, vel = 0, dragging = false;
    var lastX = 0, lastT = 0, idleUntil = 0, raf = null;

    // -------------------------------------------------------------- paint
    function size() {
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      paint();
    }

    function usable(im) { return im && im.complete && im.naturalWidth; }

    // Nearest frame that has actually finished loading, so it can be shown
    // (and dragged) before all 72 are in.
    function nearest(i) {
      for (var d = 0; d < N; d++) {
        var a = imgs[(i + d) % N], b = imgs[((i - d) % N + N) % N];
        if (usable(a)) return a;
        if (usable(b)) return b;
      }
      return null;
    }

    function draw(im, alpha) {
      var s = Math.min(cv.width / im.naturalWidth, cv.height / im.naturalHeight);
      var dw = im.naturalWidth * s, dh = im.naturalHeight * s;
      ctx.globalAlpha = alpha;
      ctx.drawImage(im, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
    }

    function paint() {
      var base = Math.floor(frame);
      var i = ((base % N) + N) % N, j = (i + 1) % N;
      var t = frame - base;                               // 0..1 between frames
      var a = usable(imgs[i]) ? imgs[i] : nearest(i);
      if (!a) return;
      ctx.clearRect(0, 0, cv.width, cv.height);          // keep the alpha, do not fill
      // contain-fit: the whole pump stays visible whatever box the host gives us
      draw(a, 1);
      // Blend in the next frame by how far we are between the two, so the
      // turn reads as continuous rotation instead of visibly stepping 5 degrees
      // at a time. Drawn over a fully-opaque base so the pump never goes
      // see-through mid-blend.
      if (t > 0.01 && usable(imgs[j])) draw(imgs[j], t);
      ctx.globalAlpha = 1;
    }

    // ------------------------------------------------------------- motion
    var prev = 0;
    function tick(t) {
      if (!prev) prev = t;
      var dt = Math.min((t - prev) / 1000, 0.1); prev = t;
      if (!dragging) {
        if (Math.abs(vel) > 0.25) {
          frame += vel * dt;
          vel *= Math.pow(0.12, dt);                     // flick decays over ~1s
        } else {
          vel = 0;
          if (!reduce && t > idleUntil) frame += (N / o.secondsPerTurn) * dt;
        }
      }
      frame = ((frame % N) + N) % N;
      paint();
      raf = global.requestAnimationFrame(tick);
    }

    // ------------------------------------------------------------ pointer
    function perFrame() { return (el.clientWidth * o.dragTurns) / N; }

    el.addEventListener('pointerdown', function (e) {
      if (!loaded) return;
      e.preventDefault();
      dragging = true; vel = 0;
      lastX = e.clientX; lastT = performance.now();
      cv.style.cursor = 'grabbing';
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var now = performance.now();
      var df = (e.clientX - lastX) / perFrame();
      frame = ((frame + df) % N + N) % N;
      var dt = (now - lastT) / 1000;
      if (dt > 0.004) { vel = df / dt; lastT = now; }
      lastX = e.clientX;
      paint();
    });

    function release(e) {
      if (!dragging) return;
      dragging = false;
      cv.style.cursor = 'grab';
      if (e && e.pointerId != null && el.releasePointerCapture &&
          el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      vel = Math.max(-N * 4, Math.min(N * 4, vel));      // cap a violent flick
      idleUntil = performance.now() + 1500;              // pause the idle spin briefly
    }
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    el.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      frame += (e.key === 'ArrowRight' ? 1 : -1);
      idleUntil = performance.now() + 1500;
      paint();
      e.preventDefault();
    });

    // ------------------------------------------------------------ loading
    function load() {
      for (var i = 0; i < N; i++) {
        (function (i) {
          var im = new Image();
          im.decoding = 'async';
          im.onload = im.onerror = function () {
            loaded++;
            if (i === 0) {                                // show something immediately
              size();
              if (!raf) raf = global.requestAnimationFrame(tick);
            }
            if (loaded === N) {
              ready = true; size();
              if (!raf) raf = global.requestAnimationFrame(tick);
              el.dispatchEvent(new CustomEvent('samnan-spinner:ready'));
            }
          };
          im.src = o.frames.replace(/\/$/, '') + '/f' +
                   (i < 10 ? '0' + i : i) + '.webp';
          imgs[i] = im;
        })(i);
      }
    }

    // A login screen should not spend 1.8MB before the form is usable, so unless the
    // host opts out we wait until the element is actually on screen.
    if (o.lazy && global.IntersectionObserver) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (x) { return x.isIntersecting; })) {
          io.disconnect();
          load();
        }
      }, { rootMargin: '200px' });
      io.observe(el);
    } else {
      load();
    }

    global.addEventListener('resize', size);

    return {
      el: el,
      destroy: function () {
        if (raf) global.cancelAnimationFrame(raf);
        global.removeEventListener('resize', size);
        el.removeChild(cv);
        el.__samnanSpinner = false;
      }
    };
  }

  function auto() {
    var els = document.querySelectorAll('[data-samnan-spinner]');
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }

  global.SamnanSpinner = { mount: mount, auto: auto };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', auto);
  } else {
    auto();
  }
})(window);
