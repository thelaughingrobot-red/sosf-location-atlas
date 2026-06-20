/* Before/after compare slider.
   Works on any .compare element. Pointer-drag + accessible range input.
   Degrades to a static split if JS is off (range defaults to 50%). */
(function () {
  function init(el) {
    var range = el.querySelector(".compare__range");
    if (!range) return;
    var frame = el.closest(".frame") || el;
    // badges sit outside .compare; fade each to match how much of its photo is
    // showing, so the bright label always matches what you're looking at
    var thenBadge = frame.querySelector(".frame__badge:not(.frame__badge--after)");
    var nowBadge = frame.querySelector(".frame__badge--after");
    function setSplit(v) {
      v = +v || 0;
      frame.style.setProperty("--split", v); // unitless 0-100; CSS uses calc(var(--split) * 1%)
      if (thenBadge) thenBadge.style.opacity = v / 100;       // THEN shows left of divider
      if (nowBadge) nowBadge.style.opacity = 1 - v / 100;     // NOW shows right of divider
    }
    setSplit(range.value || 50);
    range.addEventListener("input", function () { setSplit(range.value); });
  }
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".compare").forEach(init);
  });
})();
