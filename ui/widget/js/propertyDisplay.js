/**
 * Property Display Module for Property Owner Widget
 * Handles displaying property information, comparisons, and map
 */

const PropertyDisplay = (() => {
  let currentProperty = null;
  let neighborhoodProperties = [];

  /**
   * Initialize property display module
   */
  const init = () => {
    console.log('Initializing Property Display Module...');
  };

  /**
   * Display property information
   * @param {object} property - Property object to display
   */
  const displayProperty = (property) => {
    if (!property) {
      console.error('No property provided to displayProperty');
      return;
    }

    currentProperty = property;
    console.log('✓ Displaying property:', property.address);

    try {
      // Update property information section
      console.log('→ Updating property info...');
      updatePropertyInfo(property);

      // Show/hide sections
      console.log('→ Showing sections...');
      showSections();

      // Update map with property location
      console.log('→ Updating map...');
      if (typeof MapInteraction !== 'undefined') {
        console.log('  MapInteraction found');
        MapInteraction.loadPropertyData([property]);
        console.log('  ✓ Property loaded on map');
      } else {
        console.warn('  MapInteraction not found');
      }
    } catch (error) {
      console.error('Error displaying property:', error);
    }
  };

  /**
   * Update property information display
   * @param {object} property - Property object
   */
  const updatePropertyInfo = (property) => {
    // Property Details
    setElementText('propertyAddress', property.address);
    setElementText('propertyId', property.id);
    setElementText('propertyType', property.property_type);
    setElementText('propertyLotSize', Utils.formatLotSize(property.lot_size));

    // Assessment Values
    const lastValue = property.last_year_value || property.tax_year_value;
    const currentValue = property.predicted_value || property.tax_year_value;

    setElementText('propertyLastValue', Utils.formatCurrency(lastValue));
    setElementText('propertyLastYear', `(${new Date().getFullYear() - 1})`);

    setElementText('propertyCurrentValue', Utils.formatCurrency(currentValue));
    setElementText('propertyCurrentYear', `(${new Date().getFullYear()})`);

    // Change Information
    const dollarChange = currentValue - lastValue;
    const percentChange = Utils.calculatePercentChange(lastValue, currentValue);

    setElementText('changeAmount', Utils.formatCurrency(dollarChange));
    setElementText('changePercent', Utils.formatPercentage(percentChange));

    // Update change bar width (max 100 pixels for 100% change)
    const changeBar = document.getElementById('changeBar');
    if (changeBar) {
      const barWidth = Math.min(Math.abs(percentChange), 100);
      changeBar.style.width = barWidth + '%';
      changeBar.style.backgroundColor =
        percentChange > 0 ? '#ffb2b6' : '#a0caff';
    }

    // Tax Status
    setElementText('taxStatus', property.tax_status || 'Current');
  };


  /**
   * Show/hide relevant sections
   */
  const showSections = () => {
    console.log('showSections called');

    // Hide empty state
    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
      emptyState.classList.add('hidden');
      console.log('✓ Empty state hidden');
    } else {
      console.warn('emptyState not found');
    }

    // Show sections
    const sections = [
      'propertySection',
    ];

    sections.forEach((sectionId) => {
      const section = document.getElementById(sectionId);
      if (section) {
        section.classList.remove('hidden');
        console.log(`✓ ${sectionId} shown`);
      } else {
        console.warn(`${sectionId} not found`);
      }
    });

    const sidebar = document.getElementById('sidebarSection');
    if (sidebar) {
      sidebar.classList.remove('hidden');
      sidebar.classList.add('flex', 'flex-col');
      console.log('sidebarSection shown');
    }

    if (typeof MapInteraction !== 'undefined') {
      setTimeout(() => MapInteraction.resize(), 0);
      setTimeout(() => MapInteraction.resize(), 250);
    }
  };

  /**
   * Hide all property sections
   */
  const hideSections = () => {
    const sections = [
      'mapSection',
      'propertySection',
    ];

    sections.forEach((sectionId) => {
      const section = document.getElementById(sectionId);
      if (section) {
        section.classList.add('hidden');
      }
    });

    const sidebar = document.getElementById('sidebarSection');
    if (sidebar) {
      sidebar.classList.add('hidden');
      sidebar.classList.remove('flex', 'flex-col');
    }

    // Show empty state
    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
      emptyState.classList.remove('hidden');
    }
  };

  /**
   * Set element text content
   * @param {string} elementId - Element ID
   * @param {string} text - Text to set
   */
  const setElementText = (elementId, text) => {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = text;
    }
  };

  /**
   * Get current property
   * @returns {object} Current property
   */
  const getCurrentProperty = () => {
    return currentProperty;
  };

  /**
   * Get neighborhood properties
   * @returns {array} Neighborhood properties
   */
  const getNeighborhoodProperties = () => {
    return neighborhoodProperties;
  };

  /**
   * Clear display and reset to empty state
   */
  const clear = () => {
    currentProperty = null;
    neighborhoodProperties = [];
    hideSections();
  };

  // Setup event listeners
  const setupEventListeners = () => {
    // Request review button
    const requestReviewBtn = document.getElementById('requestReviewBtn');
    if (requestReviewBtn) {
      requestReviewBtn.addEventListener('click', () => {
        if (currentProperty) {
          handleRequestReview(currentProperty);
        }
      });
    }

    // Document download buttons
    const downloadButtons = document.querySelectorAll(
      '.space-y-2 > button:not(#requestReviewBtn)'
    );
    downloadButtons.forEach((btn, index) => {
      btn.addEventListener('click', () => {
        const docNames = ['Tax History', 'Assessment Report', 'Neighborhood Data'];
        downloadDocument(docNames[index]);
      });
    });
  };

  /**
   * Handle request review button click
   * @param {object} property - Property to review
   */
  const handleRequestReview = (property) => {
    console.log('Review requested for property:', property.address);
    alert(
      `Review request submitted for ${property.address}. You will receive a confirmation email shortly.`
    );
  };

  /**
   * Download document
   * @param {string} docName - Document name
   */
  const downloadDocument = (docName) => {
    console.log('Downloading document:', docName);
    if (currentProperty) {
      const filename = `${docName.replace(/\s+/g, '_')}_${currentProperty.id}.pdf`;
      console.log('Would download:', filename);
      // In a real app, this would trigger a file download
    }
  };

  // Initialize event listeners on module load
  setupEventListeners();

  // Public API
  return {
    init,
    displayProperty,
    getCurrentProperty,
    getNeighborhoodProperties,
    clear,
  };
})();
