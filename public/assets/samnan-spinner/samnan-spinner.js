/*!
 * samnan-spinner - a drag-to-rotate 360 view of a Samnan product.
 *
 * Drag sideways to turn it, drag up and down to tilt it over and look at the underside.
 * Flick to send it spinning. It idles in a slow spin and eases back to level a moment
 * after you let go.
 *
 * Frames are rendered in Blender (Cycles/OptiX) on a TRANSPARENT background, so the
 * product composites onto whatever colour the host page uses rather than carrying a
 * baked-in backdrop.
 *
 * No dependencies, no build step.
 *
 *   <div data-samnan-spinner data-frames="/assets/samnan-spinner/frames"></div>
 *   <script src="/assets/samnan-spinner/samnan-spinner.js" defer></script>
 *
 * or explicitly:
 *
 *   SamnanSpinner.mount(el, { frames: '/assets/samnan-spinner/frames' });
 *
 * Accessibility: honours prefers-reduced-motion by not auto-spinning (dragging still
 * works), is keyboard-reachable, and the arrow keys turn and tilt it.
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    frames: 'frames',
    ext: 'webp',

    // Idle spin speed. This is NOT a free aesthetic choice - together with the number
    // of frames in the home row it fixes the frame rate:
    //
    //     frames per second = home row frame count / secondsPerTurn
    //
    // Below about 24 the individual frames start to show and it reads as a slideshow
    // rather than a rotation. The first version of this shipped 72 frames at 14s -
    // 5 fps - and looked broken. 240 frames over 8s is 30 fps: smooth, and still
    // unhurried enough to sit behind a login form.
    //
    // If you want it slower than that, render MORE FRAMES. Do not just raise this
    // number, and do not reach for cross-fading between neighbouring frames: these
    // renders carry an alpha channel, so a blend shows the outgoing frame through the
    // transparent parts of the incoming one and you briefly see two products at once.
    // It morphs instead of turning, and no amount of tuning the blend removes it.
    secondsPerTurn: 8,

    dragTurns: 0.9,    // turns given by one drag across the element's width
    tilt: true,        // allow the vertical axis at all
    tiltRange: 150,    // degrees of tilt given by one drag down the element's height
    homeAfter: 2500,   // ms of stillness before it eases back to the home elevation

    lazy: true,        // wait until it scrolls into view before fetching anything

    // Frames are fetched in a spreading order (every 16th, then every 8th, ...) and the
    // spin starts once this fraction of the home row has landed. Anything still missing
    // falls back to its nearest loaded neighbour, which reads as a momentary hold
    // rather than a gap. The tilt rows start drawing from their very first frame, since
    // they are only ever seen under a finger that is already moving.
    startAt: 0.75,
    concurrency: 12,

    // Supply rows yourself to skip the manifest fetch, e.g.
    //   rows: [{ elev: 12, dir: 'e+12', count: 240, pad: 3, home: true }, ...]
    // With no rows and no manifest it falls back to a single flat ring of `count`
    // frames sitting directly in `frames/`, which is what the first version shipped.
    rows: null,
    count: 240,

    // Only consulted when there is no manifest. The first version of this shipped a
    // flat ring of 72 frames named f00..f71; this one defaults to 240 named
    // f000..f239. Assuming either way means that dropping new JS onto an older frames
    // folder requests names that do not exist and paints nothing at all - a blank
    // panel, no error. So instead ask for the first frame of each layout in turn and
    // use whichever actually answers.
    flatLayouts: [{ count: 240, pad: 3 }, { count: 72, pad: 2 }],

    label: 'Samnan Star-high SHC50 pump, rotatable and tiltable'
  };

  function mount(el, opts) {
    if (!el || el.__samnanSpinner) return null;
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    if (opts) for (var j in opts) o[j] = opts[j];
    var d = el.dataset;
    if (d.frames) o.frames = d.frames;
    if (d.count) o.count = parseInt(d.count, 10) || o.count;
    if (d.secondsPerTurn) o.secondsPerTurn = parseFloat(d.secondsPerTurn) || o.secondsPerTurn;
    if (d.tilt === 'false') o.tilt = false;
    el.__samnanSpinner = true;

    var base = o.frames.replace(/\/$/, '');
    var reduce = global.matchMedia &&
                 global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------------------------------------------------------------- DOM
    var cv = document.createElement('canvas');
    // user-select matters as much as touch-action here. Without it a horizontal drag
    // starts a text selection, and Chrome paints its selection tint as a pale box over
    // the whole canvas - which looks exactly like the transparency having failed.
    // Done in CSS rather than preventDefault on pointerdown, because preventDefault
    // would also stop the element taking focus and break the arrow keys.
    var NOSELECT = 'user-select:none;-webkit-user-select:none;' +
                   '-webkit-tap-highlight-color:transparent';
    cv.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;' +
                       'cursor:grab;' + NOSELECT;
    el.style.touchAction = 'none';
    el.style.userSelect = 'none';
    el.style.webkitUserSelect = 'none';
    el.appendChild(cv);
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', o.label);
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    var ctx = cv.getContext('2d');

    // ------------------------------------------------------------- state
    // Position is held as an angle in turns rather than a frame index, because the
    // rows do not all have the same number of frames - the home row is dense enough to
    // autoplay, the tilt rows are not - and an index would not survive a row change.
    var rows = [], home = 0, elev = 0, elevMin = 0, elevMax = 0;
    var ang = 0, vel = 0, dragging = false, spinning = false;
    var lastX = 0, lastY = 0, lastT = 0, idleUntil = 0, raf = null;
    var anyPainted = false, dead = false;

    // -------------------------------------------------------------- paint
    function size() {
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      paint();
    }

    // Nearest row that has at least one frame up. While a tilt row is still arriving
    // this keeps the neighbouring elevation on screen instead of blanking.
    function pickRow() {
      var best = null, bd = 1e9;
      for (var i = 0; i < rows.length; i++) {
        if (!rows[i].any) continue;
        var dd = Math.abs(rows[i].elev - elev);
        if (dd < bd) { bd = dd; best = rows[i]; }
      }
      return best;
    }

    function frameIn(r) {
      var n = r.count;
      var i = Math.floor(((ang % 1) + 1) % 1 * n) % n;
      if (r.ok[i]) return r.imgs[i];
      for (var s = 1; s <= n; s++) {          // nearest angle we actually have
        var a = (i - s + n) % n, b = (i + s) % n;
        if (r.ok[a]) return r.imgs[a];
        if (r.ok[b]) return r.imgs[b];
      }
      return null;
    }

    function paint() {
      var r = pickRow();
      if (!r) return;
      var im = frameIn(r);
      if (!im || !im.naturalWidth) return;
      ctx.clearRect(0, 0, cv.width, cv.height);        // keep the alpha, do not fill
      // contain-fit: the whole product stays visible whatever box the host gives us
      var s = Math.min(cv.width / im.naturalWidth, cv.height / im.naturalHeight);
      var dw = im.naturalWidth * s, dh = im.naturalHeight * s;
      ctx.drawImage(im, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
      anyPainted = true;
    }

    // ------------------------------------------------------------- motion
    // True before the rows are known, so the loop is safe to run from the moment a
    // keypress starts it - which can happen before the manifest has come back.
    function atHome() {
      return !rows.length || Math.abs(elev - rows[home].elev) < 0.5;
    }

    var prev = 0;
    function tick(t) {
      if (dead) return;
      if (!prev) prev = t;
      var dt = Math.min((t - prev) / 1000, 0.1); prev = t;

      if (!dragging) {
        // Ease back to the home elevation once they stop. Off the home row there are
        // only 72 frames, so spinning there would be 9 fps - steppy in exactly the way
        // this whole component exists to avoid. Tilt is something you hold, not
        // something it does by itself.
        if (!atHome() && t > idleUntil) {
          elev += (rows[home].elev - elev) * (1 - Math.pow(0.004, dt));
          if (Math.abs(elev - rows[home].elev) < 0.5) elev = rows[home].elev;
        }
        if (Math.abs(vel) > 0.004) {
          ang += vel * dt;
          vel *= Math.pow(0.12, dt);                   // flick decays over about a second
        } else {
          vel = 0;
          if (!reduce && atHome() && t > idleUntil) ang += dt / o.secondsPerTurn;
        }
      }
      ang = ((ang % 1) + 1) % 1;
      want(elev);                                      // pull in the row under the finger
      paint();
      raf = global.requestAnimationFrame(tick);
    }

    function spin() {
      if (raf || dead) return;
      prev = 0;
      raf = global.requestAnimationFrame(tick);
    }

    // ------------------------------------------------------------ pointer
    function onDown(e) {
      if (!anyPainted) return;                         // draggable as soon as anything shows
      dragging = true; vel = 0;
      lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
      cv.style.cursor = 'grabbing';
      // Throws NotFoundError if the pointer is no longer active by the time this runs -
      // a fast tap, or a synthetic event. Uncaught it aborts the rest of the handler,
      // so the drag would start with the loop in a half-configured state.
      try { if (el.setPointerCapture) el.setPointerCapture(e.pointerId); } catch (err) {}
    }

    function onMove(e) {
      if (!dragging) return;
      var now = performance.now();
      var w = el.clientWidth || 1, h = el.clientHeight || 1;

      var da = ((e.clientX - lastX) / w) * o.dragTurns;
      ang = (((ang + da) % 1) + 1) % 1;

      if (o.tilt && rows.length > 1) {
        // Drag down lowers the camera, so pulling down tips the product over and shows
        // you its underside - the same direction as the two-axis viewer.
        elev -= ((e.clientY - lastY) / h) * o.tiltRange;
        elev = Math.max(elevMin, Math.min(elevMax, elev));
      }

      var dt = (now - lastT) / 1000;
      if (dt > 0.004) { vel = da / dt; lastT = now; }
      lastX = e.clientX; lastY = e.clientY;
      // Queue the row being tilted into from here as well as from the loop. A
      // background tab throttles requestAnimationFrame to about once a second, and
      // relying on the loop alone meant a drag could reach a new elevation and wait
      // that long before anything was even requested.
      want(elev);
      paint();
    }

    function release(e) {
      if (!dragging) return;
      dragging = false;
      cv.style.cursor = 'grab';
      if (e && e.pointerId != null && el.releasePointerCapture &&
          el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      vel = Math.max(-4, Math.min(4, vel));            // cap a violent flick, turns/sec
      idleUntil = performance.now() + o.homeAfter;
      spin();
    }
    function onKey(e) {
      if (!rows.length) return;                        // manifest has not landed yet
      var horiz = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      var vert = o.tilt && rows.length > 1 &&
                 (e.key === 'ArrowUp' || e.key === 'ArrowDown');
      if (!horiz && !vert) return;
      if (horiz) {
        ang = (((ang + (e.key === 'ArrowRight' ? 0.02 : -0.02)) % 1) + 1) % 1;
      } else {
        elev += (e.key === 'ArrowUp' ? 15 : -15);
        elev = Math.max(elevMin, Math.min(elevMax, elev));
      }
      idleUntil = performance.now() + o.homeAfter;
      want(elev); paint(); spin();
      e.preventDefault();
    }

    var BOUND = [['pointerdown', onDown], ['pointermove', onMove],
                 ['pointerup', release], ['pointercancel', release],
                 ['keydown', onKey]];
    for (var b = 0; b < BOUND.length; b++) el.addEventListener(BOUND[b][0], BOUND[b][1]);

    // ------------------------------------------------------------ loading
    // One queue for every row. New requests go on the front, because a row the user is
    // tilting into right now matters more than the tail of the home row.
    var queue = [], inflight = 0;

    function url(r, i) {
      var s = String(i);
      while (s.length < r.pad) s = '0' + s;
      return base + (r.dir ? '/' + r.dir : '') + '/f' + s + '.' + o.ext;
    }

    // Every 16th frame, then every 8th, and so on, so whatever has arrived at any
    // moment is spread evenly round the turn and the fallback above is never reaching
    // more than a few degrees.
    function order(n) {
      var seen = new Array(n), out = [], s, i;
      for (s = 16; s >= 1; s = s >> 1) {
        for (i = 0; i < n; i += s) if (!seen[i]) { seen[i] = 1; out.push(i); }
      }
      return out;
    }

    function want(e) {
      if (!rows.length) return;
      var best = null, bd = 1e9;
      for (var i = 0; i < rows.length; i++) {
        var dd = Math.abs(rows[i].elev - e);
        if (dd < bd) { bd = dd; best = rows[i]; }
      }
      if (best && !best.started) {
        best.started = true;
        var q = order(best.count).map(function (ix) { return [best, ix]; });
        queue = q.concat(queue);
        pump();
      }
    }

    function done(r, i, okFlag) {
      inflight--; r.loaded++;
      if (okFlag) {
        r.ok[i] = 1;
        if (!r.any) { r.any = true; if (!anyPainted) size(); else paint(); }
      }
      if (!r.ready && r.loaded >= r.need) {
        r.ready = true;
        if (r.home) {
          size(); spin();
          el.dispatchEvent(new CustomEvent('samnan-spinner:ready'));
        }
      }
      pump();
    }

    function pump() {
      while (!dead && inflight < o.concurrency && queue.length) {
        (function (job) {
          var r = job[0], i = job[1];
          inflight++;
          var im = new Image();
          im.decoding = 'async';
          im.onload = function () { done(r, i, true); };
          im.onerror = function () { done(r, i, false); };
          im.src = url(r, i);
          r.imgs[i] = im;
        })(queue.shift());
      }
    }

    function setRows(list) {
      if (dead) return;
      rows = list.map(function (r) {
        return {
          elev: r.elev, dir: r.dir || '', count: r.count,
          pad: r.pad || String(r.count - 1).length,
          home: !!r.home,
          imgs: new Array(r.count), ok: new Array(r.count),
          loaded: 0, any: false, ready: false, started: false,
          // The home row waits until it can spin smoothly; a tilt row is under a
          // finger, so it draws the moment the first frame lands.
          //
          // A row can override the fraction, and for a 480-frame ring that override
          // matters more than it looks. The fetch order runs every 16th frame, then
          // every 8th, 4th, 2nd, and finally the odd ones - so at exactly 50% loaded
          // the frames in hand are precisely the even indices, which is a complete,
          // evenly spaced 240-frame ring. Starting there gives a flawless 30 fps
          // immediately that upgrades to 60 as the rest arrive. Starting at 25% would
          // instead give every 4th frame, which is 15 fps, and looks like the
          // slideshow this component exists to avoid.
          need: r.home
            ? Math.max(1, Math.ceil((r.startAt || o.startAt) * r.count))
            : 1
        };
      }).sort(function (a, b) { return a.elev - b.elev; });

      home = 0;
      for (var i = 0; i < rows.length; i++) if (rows[i].home) home = i;
      if (!rows[home].home) rows[home].home = true;
      elev = rows[home].elev;
      elevMin = rows[0].elev;
      elevMax = rows[rows.length - 1].elev;
      if (rows.length < 2) o.tilt = false;

      want(elev);
      spin();
    }

    // No manifest: find out which flat layout is actually on disk by asking for its
    // first frame, instead of guessing and silently painting nothing.
    function probeFlat(at) {
      if (dead) return;
      var cands = o.flatLayouts || [];
      if (at >= cands.length) {                        // nothing answered; use the default
        setRows([{ elev: 0, dir: '', count: o.count, home: true }]);
        return;
      }
      var c = cands[at];
      var name = '0';
      while (name.length < c.pad) name = '0' + name;
      var probe = new Image();
      probe.onload = function () {
        setRows([{ elev: 0, dir: '', count: c.count, pad: c.pad, home: true }]);
      };
      probe.onerror = function () { probeFlat(at + 1); };
      probe.src = base + '/f' + name + '.' + o.ext;
    }

    function start() {
      if (dead) return;
      if (o.rows) { setRows(o.rows); return; }
      // No rows given: ask for a manifest, and if there isn't one fall back to probing
      // for the flat single-ring layout the first version of this shipped.
      if (!global.fetch) { probeFlat(0); return; }
      // Revalidate the manifest, never serve it blind from cache. The frames are
      // immutable and should be cached as hard as the host likes, but the manifest is
      // the index that says which rows exist - and rows get ADDED. This shipped with
      // one row while the tilt elevations were still rendering, so a returning visitor
      // holding a cached copy would have kept a spinner that could not tilt, with no
      // way to find out otherwise. 'no-cache' still allows a 304, and the file is well
      // under a kilobyte.
      global.fetch(base + '/manifest.json', { cache: 'no-cache' })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (m) {
          if (!m || !m.rows || !m.rows.length) { probeFlat(0); return; }
          if (m.ext) o.ext = m.ext;
          var list = m.rows.map(function (r) {
            return {
              elev: r.elev, dir: r.dir, count: r.count, pad: r.pad,
              startAt: r.startAt,
              home: r.home || (m.home != null && r.elev === m.home)
            };
          });
          setRows(list);
        })
        .catch(function () { probeFlat(0); });
    }

    // A login screen should not spend megabytes before the form is usable, so unless
    // the host opts out we wait until the element is actually on screen.
    var io = null;
    if (o.lazy && global.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        if (entries.some(function (x) { return x.isIntersecting; })) {
          io.disconnect();
          start();
        }
      }, { rootMargin: '200px' });
      io.observe(el);
    } else {
      start();
    }

    global.addEventListener('resize', size);

    return {
      el: el,
      // Read-only snapshot. Everything above lives in a closure, so without this there
      // is no way to tell a spinner that is ignoring a drag from one whose frames are
      // simply missing - they look identical from outside.
      state: function () {
        return {
          elev: elev, ang: ang, dragging: dragging, tilt: o.tilt,
          elevMin: elevMin, elevMax: elevMax, home: home,
          rows: rows.map(function (r) {
            return { dir: r.dir, elev: r.elev, count: r.count,
                     started: !!r.started, loaded: r.loaded, any: !!r.any };
          })
        };
      },
      destroy: function () {
        dead = true;
        queue.length = 0;
        if (raf) global.cancelAnimationFrame(raf);
        raf = null;
        // The observer outlives the element otherwise: React StrictMode mounts,
        // destroys and remounts in development, and an observer left armed on the
        // dead instance fires start() on it later.
        if (io) { io.disconnect(); io = null; }
        for (var i = 0; i < BOUND.length; i++) {
          el.removeEventListener(BOUND[i][0], BOUND[i][1]);
        }
        global.removeEventListener('resize', size);
        if (cv.parentNode === el) el.removeChild(cv);
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
