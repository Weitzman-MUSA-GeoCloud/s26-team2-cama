/**
 * Property Popup Manager for Tax Assessor Review Interface
 * Handles property detail popup display and interactions
 */

const PropertyPopup = (() => {
  const popupElement = document.getElementById('propertyPopup');
  const closeBtn = document.getElementById('closePopupBtn');
  let currentProperty = null;

  /**
   * Initialize popup event listeners
   */
  const init = () => {
    // Close button
    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }

    // Close on overlay click
    if (popupElement) {
      popupElement.addEventListener('click', (e) => {
        if (e.target === popupElement) {
          close();
        }
      });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        close();
      }
    });
  };

  /**
   * Open popup with property data
   * @param {object} property - Property object to display
   */
  const open = (property) => {
    if (!property || !popupElement) return;

    currentProperty = property;

    document.getElementById('popupAddress').textContent = property.address || '-';
    document.getElementById('popupId').textContent = property.id || '-';
    document.getElementById('popupCurrentValue').textContent = Utils.formatCurrency(
      property.tax_year_value
    );
    document.getElementById('popupPredictedValue').textContent =
      Utils.formatCurrency(property.predicted_value);

    const changePercent = property.change_percent;
    const changeAmount = property.predicted_value - property.tax_year_value;
    const changeSign = changeAmount >= 0 ? '+' : '';
    const changeColor = changeAmount >= 0 ? '#ffb2b6' : '#a0caff';

    const changePercentElement = document.getElementById('popupChangePercent');
    const changeAmountElement = document.getElementById('popupChangeAmount');
    changePercentElement.textContent = `${changeSign}${Utils.formatPercentage(changePercent)}`;
    changePercentElement.style.color = changeColor;
    changeAmountElement.textContent = `${changeSign}${Utils.formatCurrency(changeAmount)}`;

    updateStreetView(property);

    // Show popup with animation
    popupElement.classList.remove('hidden');
    popupElement.style.animation = 'fadeIn 0.2s ease-in';
  };

  const updateStreetView = (property) => {
    const frame = document.getElementById('popupStreetView');
    const link = document.getElementById('popupStreetViewLink');
    if (!frame) return;

    const hasCoordinates =
      Number.isFinite(Number(property.lat)) && Number.isFinite(Number(property.lng));
    const query = encodeURIComponent(`${property.address || ''}, Philadelphia, PA`);
    const mapUrl = hasCoordinates
      ? `https://www.google.com/maps?q=${property.lat},${property.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${query}`;
    const embedUrl = hasCoordinates
      ? `https://www.google.com/maps?layer=c&cbll=${property.lat},${property.lng}&cbp=11,0,0,0,0&output=svembed`
      : `https://www.google.com/maps?q=${query}&output=embed`;

    frame.src = embedUrl;
    if (link) link.href = mapUrl;
  };

  /**
   * Close popup
   */
  const close = () => {
    if (popupElement) {
      popupElement.classList.add('hidden');
      const frame = document.getElementById('popupStreetView');
      if (frame) frame.src = 'about:blank';
      currentProperty = null;
    }
  };

  /**
   * Get currently displayed property
   * @returns {object} Current property object
   */
  const getCurrentProperty = () => {
    return currentProperty;
  };

  /**
   * Check if popup is open
   * @returns {boolean} True if popup is visible
   */
  const isOpen = () => {
    return !popupElement?.classList.contains('hidden');
  };

  /**
   * Approve property assessment
   * @param {function} callback - Callback function on approval
   */
  const approveProperty = (callback) => {
    if (!currentProperty) return;

    // Add your approval logic here
    console.log('Approving property:', currentProperty.id);

    if (callback) {
      callback(currentProperty);
    }

    // Show confirmation or update UI
    showNotification('Property approved successfully', 'success');
    close();
  };

  /**
   * Flag property for review
   * @param {string} reason - Reason for flagging
   * @param {function} callback - Callback function on flag
   */
  const flagProperty = (reason = '', callback) => {
    if (!currentProperty) return;

    console.log('Flagging property:', currentProperty.id, 'Reason:', reason);

    if (callback) {
      callback(currentProperty, reason);
    }

    showNotification('Property flagged for review', 'warning');
    close();
  };

  /**
   * Show notification message
   * @param {string} message - Notification message
   * @param {string} type - 'success', 'error', 'warning', 'info'
   */
  const showNotification = (message, type = 'info') => {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 24px;
      background-color: ${
        type === 'success'
          ? '#a0caff'
          : type === 'error'
            ? '#e20546'
            : type === 'warning'
              ? '#ffb2b6'
              : '#1e2020'
      };
      color: ${type === 'info' ? '#e2e2e2' : '#121414'};
      border-radius: 0;
      font-weight: 600;
      font-size: 14px;
      z-index: 9999;
      animation: slideDown 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideUp 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  };

  /**
   * Update property in popup
   * @param {object} updates - Object with updated fields
   */
  const updateProperty = (updates) => {
    if (!currentProperty) return;

    currentProperty = { ...currentProperty, ...updates };

    // Refresh display
    if (isOpen()) {
      open(currentProperty);
    }
  };

  /**
   * Populate popup with comparison data
   * @param {object} comparisonData - Neighborhood comparison data
   */
  const addComparisonInfo = (comparisonData) => {
    if (!comparisonData) return;

    const comparisonDiv = document.createElement('div');
    comparisonDiv.className = 'p-6 border-t border-[#e2e2e2]/20';
    comparisonDiv.innerHTML = `
      <label class="text-xs text-[#e2e2e2]/60 uppercase tracking-wider block mb-3">Neighborhood Comparison</label>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span>Your Property:</span>
          <span class="font-600">${Utils.formatCurrency(currentProperty.tax_year_value)}</span>
        </div>
        <div class="flex justify-between">
          <span>Neighborhood Average:</span>
          <span class="font-600">${Utils.formatCurrency(comparisonData.avgValue)}</span>
        </div>
        <div class="flex justify-between">
          <span>Difference:</span>
          <span class="font-600 ${currentProperty.tax_year_value > comparisonData.avgValue ? 'text-[#ffb2b6]' : 'text-[#a0caff]'}">
            ${currentProperty.tax_year_value > comparisonData.avgValue ? '+' : '-'}
            ${Utils.formatCurrency(Math.abs(currentProperty.tax_year_value - comparisonData.avgValue))}
          </span>
        </div>
      </div>
    `;

    const popupContent = popupElement.querySelector('[class*="bg-\\[#1e2020\\]"]');
    if (popupContent) {
      popupContent.appendChild(comparisonDiv);
    }
  };

  // Public API
  return {
    init,
    open,
    close,
    getCurrentProperty,
    isOpen,
    approveProperty,
    flagProperty,
    showNotification,
    updateProperty,
    addComparisonInfo,
  };
})();
