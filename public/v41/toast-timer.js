// 안내(토스트) 시간 한 벌(#1273 9번). 보드 스크립트가 일반 스크립트라 전역에 올린다.
// 단추가 있는 안내는 8초, 단추 없는 안내는 기존 시간(2.2초)을 쓴다.
// 마우스나 초점이 안내 안으로 들어가면 남은 시간을 멈추고, 벗어나면 이어서 센다.
(function () {
  var PLAIN_TOAST_MS = 2200;
  var ACTION_TOAST_MS = 8000;

  function createToastTimer(options) {
    var opts = options || {};
    var now = opts.now || function () { return Date.now(); };
    var setTimer = opts.setTimer || function (fn, ms) { return setTimeout(fn, ms); };
    var clearTimer = opts.clearTimer || function (id) { clearTimeout(id); };
    var job = null;
    var hovering = false;
    var focusing = false;
    var bound = [];

    function stopClock() {
      if (!job || job.timer == null) return;
      clearTimer(job.timer);
      job.timer = null;
      job.remaining = Math.max(0, job.remaining - (now() - job.startedAt));
    }
    function startClock() {
      if (!job || job.timer != null || hovering || focusing) return;
      job.startedAt = now();
      job.timer = setTimer(function () {
        var done = job;
        job = null;
        if (done && done.onExpire) done.onExpire();
      }, job.remaining);
    }
    function bind(el) {
      if (bound.indexOf(el) >= 0) return;
      bound.push(el);
      el.addEventListener('mouseenter', function () { hovering = true; stopClock(); });
      el.addEventListener('mouseleave', function () { hovering = false; startClock(); });
      el.addEventListener('focusin', function () { focusing = true; stopClock(); });
      el.addEventListener('focusout', function (event) {
        // 안내 안의 단추 사이를 옮기는 동안에는 멈춤을 유지한다.
        if (event.relatedTarget && el.contains(event.relatedTarget)) return;
        focusing = false;
        startClock();
      });
    }

    return {
      arm: function (el, ms, onExpire) {
        if (job && job.timer != null) clearTimer(job.timer);
        job = { el: el, remaining: ms, startedAt: 0, timer: null, onExpire: onExpire };
        hovering = false;
        focusing = false;
        if (el) bind(el);
        startClock();
      },
      cancel: function () {
        if (job && job.timer != null) clearTimer(job.timer);
        job = null;
        hovering = false;
        focusing = false;
      },
      snapshot: function () {
        return job ? { remaining: job.remaining, paused: hovering || focusing } : null;
      }
    };
  }

  var api = { PLAIN_TOAST_MS: PLAIN_TOAST_MS, ACTION_TOAST_MS: ACTION_TOAST_MS, createToastTimer: createToastTimer };
  (globalThis.window || globalThis).LTToastTimer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
