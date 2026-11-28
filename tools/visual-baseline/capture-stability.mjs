// Capture-only stabilizers. Executed after the scene loads; never shipped to the app.
// Shadow roots are isolated CSS trees. Freezing only document styles leaves orbit
// cards and their Web Animations free to move between before/after screenshots.
export const STABILIZE = `(() => {
  const css = '*,*::before,*::after{animation-play-state:paused!important;animation-delay:0s!important;animation-duration:0s!important;transition:none!important;caret-color:transparent!important}#toast,.toast,[role="status"]{visibility:hidden!important}.book-card{will-change:auto!important;transform-style:flat!important}.book-cover{transform-style:flat!important;will-change:auto!important}';
  const visit = (root) => {
    if (!root.querySelector('style[data-visual-baseline]')) {
      const style = document.createElement('style');
      style.setAttribute('data-visual-baseline', '1');
      style.textContent = css;
      (root.nodeType === 9 ? root.documentElement : root).append(style);
    }
    // A style rule alone does not stop Web Animations API animations in a
    // shadow root. Re-apply on each capture pass for animations mounted later.
    for (const animation of root.getAnimations?.() || []) {
      try {
        const timing = animation.effect?.getComputedTiming?.() || {};
        if (Number.isFinite(timing.duration) && Number.isFinite(timing.iterations)) {
          animation.finish();
        } else {
          animation.pause();
          animation.currentTime = 0;
        }
      } catch {}
    }
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(document);
  try { window.scrollTo(0, 0); } catch {}
})()`;

// The orbit scene has a production-provided, read-only test hook. Seek after
// pausing all shadow animations so both captures show the same composition.
export const FIX_ORBIT_PHASE = `(() => {
  const orbit = globalThis.__LT_ORBIT_TEST__;
  if (!orbit) return false;
  orbit.pauseFloat?.();
  orbit.hold?.(true);
  orbit.seek?.(0.25);
  orbit.syncDomPoses?.();
  return true;
})()`;
