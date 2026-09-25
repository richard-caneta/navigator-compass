document.addEventListener('DOMContentLoaded', function () {
  var screens = document.querySelectorAll('.screen');
  var floatingNav = document.getElementById('floatingNav');
  var actionsButton = document.getElementById('home-actions-btn');
  var actionsMenu = document.getElementById('home-actions-menu');
  var popoutAction = document.getElementById('popout-action');
  var popoutLabel = document.getElementById('popout-action-label');
  var popoutDescription = document.getElementById('popout-action-description');
  var menuRefreshAction = document.getElementById('menu-refresh-action');
  var menuSyncTime = document.getElementById('menu-sync-time');
  var queryParams = new URLSearchParams(window.location.search);
  var isPopout = queryParams.get('view') === 'popout';
  var sourceWindowId = Number(queryParams.get('sourceWindowId'));

  function setActionsMenu(open) {
    actionsMenu.hidden = !open;
    actionsButton.setAttribute('aria-expanded', String(open));
  }

  function updateMenuSyncTime(timestamp) {
    menuSyncTime.textContent = timestamp
      ? new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : 'Never';
  }

  function openPopout() {
    chrome.windows.getCurrent().then(function (currentWindow) {
      var popoutUrl = chrome.runtime.getURL('sidepanel.html?view=popout&sourceWindowId=' + currentWindow.id);
      return chrome.windows.create({
        url: popoutUrl,
        type: 'popup',
        width: 400,
        height: 720,
        focused: true
      }).then(function (popoutWindow) {
        return chrome.sidePanel.close({ windowId: currentWindow.id })
          .then(function () {
            return chrome.windows.update(popoutWindow.id, { focused: true });
          });
      });
    }).then(function () {
      setActionsMenu(false);
    }).catch(function (error) {
      console.error('Unable to pop out Compass:', error);
    });
  }

  function returnToSidePanel() {
    if (!Number.isInteger(sourceWindowId) || sourceWindowId < 0) {
      console.error('Unable to return Compass: source window is unavailable.');
      return;
    }

    chrome.windows.getCurrent().then(function (popoutWindow) {
      return chrome.sidePanel.open({ windowId: sourceWindowId })
        .then(function () {
          return chrome.windows.update(sourceWindowId, { focused: true });
        })
        .then(function () {
          return chrome.windows.remove(popoutWindow.id);
        });
    }).catch(function (error) {
      console.error('Unable to reopen Compass in the side panel:', error);
    });
  }

  actionsButton.addEventListener('click', function () {
    setActionsMenu(actionsMenu.hidden);
  });

  document.addEventListener('click', function (event) {
    if (!actionsMenu.hidden && !event.target.closest('.hero')) setActionsMenu(false);
  });

  popoutAction.addEventListener('click', isPopout ? returnToSidePanel : openPopout);
  menuRefreshAction.addEventListener('click', function () {
    document.getElementById('btn-force-refresh').click();
    setActionsMenu(false);
  });

  if (isPopout) {
    popoutLabel.textContent = 'Return to side panel';
    popoutDescription.textContent = 'Close this window and return Compass';
  }

  chrome.storage.local.get(['lastSynced']).then(function (storage) {
    updateMenuSyncTime(storage.lastSynced);
  });

  chrome.storage.onChanged.addListener(function (changes, namespace) {
    if (namespace === 'local' && changes.lastSynced) {
      updateMenuSyncTime(changes.lastSynced.newValue);
    }
  });

  function showScreen(id) {
    screens.forEach(function (s) {
      s.classList.toggle('active', s.id === id);
    });

    // Show the floating nav on all pages EXCEPT the landing page
    if (id === 'screen-home') {
      floatingNav.classList.remove('visible');
    } else {
      floatingNav.classList.add('visible');
    }
  }

  document.querySelectorAll('.menu-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showScreen('screen-' + btn.getAttribute('data-target'));
    });
  });

  document.querySelectorAll('[data-breadcrumb-home]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showScreen('screen-home');
      if (window.goToHome) window.goToHome();
    });
  });

  // Home Button Logic
  document.getElementById('navHomeBtn').addEventListener('click', function () {
    showScreen('screen-home');
    if(window.goToHome) window.goToHome();
  });

  // Dynamic Back Button Logic
  document.getElementById('navBackBtn').addEventListener('click', function() {
    var dataView = document.getElementById('rulebook-data-view');

    // If we are currently inside a specific dataset, go back to the Rulebook Menu
    if (dataView && dataView.style.display === 'block') {
      if (window.closeDataView) window.closeDataView();
    } else {
      // Otherwise, we are at the top level of a module, so go Home
      showScreen('screen-home');
      if(window.goToHome) window.goToHome();
    }
  });
});