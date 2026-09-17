document.addEventListener('DOMContentLoaded', function () {
  var screens = document.querySelectorAll('.screen');

  function showScreen(id) {
    screens.forEach(function (s) {
      s.classList.toggle('active', s.id === id);
    });
  }

  document.querySelectorAll('.menu-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showScreen('screen-' + btn.getAttribute('data-target'));
    });
  });

  document.querySelectorAll('[data-back]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showScreen('screen-home');
    });
  });
});
