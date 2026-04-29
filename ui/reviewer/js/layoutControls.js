const LayoutControls = (() => {
  const init = () => {
    const leftPanel = document.getElementById('leftPanel');
    const bottomPanel = document.getElementById('bottomPanel');
    const leftResizer = document.getElementById('leftPanelResizer');
    const bottomResizer = document.getElementById('bottomPanelResizer');
    const toggleLeftBtn = document.getElementById('toggleLeftPanelBtn');
    const toggleBottomBtn = document.getElementById('toggleBottomPanelBtn');

    toggleLeftBtn?.addEventListener('click', () => {
      document.body.classList.toggle('left-panel-hidden');
      toggleLeftBtn.classList.toggle(
        'active',
        !document.body.classList.contains('left-panel-hidden')
      );
      refreshLayout();
    });

    toggleBottomBtn?.addEventListener('click', () => {
      document.body.classList.toggle('bottom-panel-hidden');
      toggleBottomBtn.classList.toggle(
        'active',
        !document.body.classList.contains('bottom-panel-hidden')
      );
      refreshLayout();
    });

    toggleLeftBtn?.classList.add('active');
    toggleBottomBtn?.classList.add('active');

    setupHorizontalResize(leftPanel, leftResizer);
    setupVerticalResize(bottomPanel, bottomResizer);
  };

  const setupHorizontalResize = (panel, handle) => {
    if (!panel || !handle) return;

    let startX = 0;
    let startWidth = 0;

    handle.addEventListener('pointerdown', (event) => {
      startX = event.clientX;
      startWidth = panel.getBoundingClientRect().width;
      handle.classList.add('dragging');
      handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener('pointermove', (event) => {
      if (!handle.classList.contains('dragging')) return;
      const nextWidth = clamp(startWidth + event.clientX - startX, 220, 520);
      panel.style.width = `${nextWidth}px`;
      refreshLayout();
    });

    handle.addEventListener('pointerup', (event) => {
      handle.classList.remove('dragging');
      handle.releasePointerCapture(event.pointerId);
      refreshLayout();
    });
  };

  const setupVerticalResize = (panel, handle) => {
    if (!panel || !handle) return;

    let startY = 0;
    let startHeight = 0;

    handle.addEventListener('pointerdown', (event) => {
      startY = event.clientY;
      startHeight = panel.getBoundingClientRect().height;
      handle.classList.add('dragging');
      handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener('pointermove', (event) => {
      if (!handle.classList.contains('dragging')) return;
      const nextHeight = clamp(startHeight - (event.clientY - startY), 260, 420);
      panel.style.height = `${nextHeight}px`;
      refreshLayout();
    });

    handle.addEventListener('pointerup', (event) => {
      handle.classList.remove('dragging');
      handle.releasePointerCapture(event.pointerId);
      refreshLayout();
    });
  };

  const refreshLayout = () => {
    window.clearTimeout(refreshLayout.timer);
    refreshLayout.timer = window.setTimeout(() => {
      const map = typeof MapInteraction !== 'undefined' ? MapInteraction.getMap() : null;
      if (map) map.resize();
      window.dispatchEvent(new Event('resize'));
    }, 80);
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  return { init };
})();

document.addEventListener('DOMContentLoaded', LayoutControls.init);
