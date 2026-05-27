(function () {
  'use strict';

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) {
      return '0:00';
    }
    var s = Math.floor(sec);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' + r : r);
  }

  function initReader(root) {
    if (!root || root.__hexoReaderBound) {
      return;
    }
    root.__hexoReaderBound = true;

    var audio = root.querySelector('.hexo-reader__audio');
    var toggle = root.querySelector('.hexo-reader__toggle');
    var panel = root.querySelector('.hexo-reader__panel');
    var playBtn = root.querySelector('.hexo-reader__play');
    var iconPlay = root.querySelector('.hexo-reader__icon-play');
    var iconPause = root.querySelector('.hexo-reader__icon-pause');
    var timeLabel = root.querySelector('.hexo-reader__time');
    var seek = root.querySelector('.hexo-reader__seek');
    var rateSel = root.querySelector('.hexo-reader__rate');
    var closeBtn = root.querySelector('.hexo-reader__close');

    if (!audio || !toggle || !panel || !playBtn) {
      return;
    }

    function setPlayingIcon(playing) {
      if (iconPlay) {
        iconPlay.hidden = !!playing;
      }
      if (iconPause) {
        iconPause.hidden = !playing;
      }
    }

    function openPanel() {
      panel.hidden = false;
      root.classList.add('hexo-reader--open');
    }

    function closePanel() {
      panel.hidden = true;
      root.classList.remove('hexo-reader--open');
    }

    toggle.addEventListener('click', function () {
      if (panel.hidden) {
        openPanel();
        if (audio.paused) {
          audio.play().catch(function () {});
        }
      } else {
        closePanel();
      }
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        closePanel();
      });
    }

    playBtn.addEventListener('click', function () {
      if (audio.paused) {
        audio.play().catch(function () {});
      } else {
        audio.pause();
      }
    });

    audio.addEventListener('play', function () { setPlayingIcon(true); });
    audio.addEventListener('pause', function () { setPlayingIcon(false); });
    audio.addEventListener('ended', function () { setPlayingIcon(false); });

    audio.addEventListener('timeupdate', function () {
      if (timeLabel) {
        timeLabel.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
      }
      if (seek && isFinite(audio.duration) && audio.duration > 0) {
        var v = Math.round((audio.currentTime / audio.duration) * 1000);
        if (!seek.__seeking) {
          seek.value = String(v);
        }
      }
    });

    audio.addEventListener('loadedmetadata', function () {
      if (timeLabel) {
        timeLabel.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
      }
    });

    audio.addEventListener('error', function () {
      if (timeLabel) {
        timeLabel.textContent = '加载失败';
      }
    });

    if (seek) {
      seek.addEventListener('mousedown', function () { seek.__seeking = true; });
      seek.addEventListener('touchstart', function () { seek.__seeking = true; }, { passive: true });
      seek.addEventListener('change', function () {
        if (isFinite(audio.duration) && audio.duration > 0) {
          audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
        }
        seek.__seeking = false;
      });
      seek.addEventListener('input', function () {
        if (isFinite(audio.duration) && audio.duration > 0 && timeLabel) {
          var t = (Number(seek.value) / 1000) * audio.duration;
          timeLabel.textContent = formatTime(t) + ' / ' + formatTime(audio.duration);
        }
      });
    }

    if (rateSel) {
      rateSel.addEventListener('change', function () {
        var v = parseFloat(rateSel.value);
        if (isFinite(v) && v > 0) {
          audio.playbackRate = v;
        }
      });
    }
  }

  function boot() {
    var roots = document.querySelectorAll('.hexo-reader');
    for (var i = 0; i < roots.length; i++) {
      initReader(roots[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
