/* Before/after compare slider.
   Works on any .compare element. Pointer-drag + accessible range input.
   Degrades to a static split if JS is off (range defaults to 50%). */
(function () {
  function init(el) {
    var range = el.querySelector(".compare__range");
    if (!range) return;
    function setSplit(v) { el.style.setProperty("--split", v + "%"); }
    setSplit(range.value || 50);
    range.addEventListener("input", function () { setSplit(range.value); });
  }
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".compare").forEach(init);
  });
})();
