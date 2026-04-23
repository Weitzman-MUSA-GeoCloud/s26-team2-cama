/**
 * Main Module for Property Owner Widget
 * Initializes and connects all modules
 */

const App = (() => {
  /**
   * Initialize the entire application
   */
  const init = async () => {
    console.log('Initializing Property Owner Widget Application...');

    try {
      // Step 1: Initialize property display module
      PropertyDisplay.init();
      console.log('✓ Property Display initialized');

      // Step 2: Initialize map
      MapInteraction.init({
        center: [-75.1652, 39.9526], // Philadelphia
        zoom: 12,
      });
      console.log('✓ Map initialized');

      // Step 3: Initialize search module
      await Search.init();
      console.log('✓ Search module initialized');

      // Step 4: Setup event listeners
      setupEventListeners();
      console.log('✓ Event listeners setup');

      console.log('✓ Application ready');
    } catch (error) {
      console.error('Error initializing application:', error);
    }
  };

  /**
   * Setup event listeners for UI controls
   */
  const setupEventListeners = () => {
    const addressInput = document.getElementById('addressSearch');

    if (!addressInput) {
      console.warn('Address input not found');
      return;
    }

    // Focus on search input on page load
    addressInput.focus();
    addressInput.placeholder =
      'e.g., 1234 Sesame St or enter a property ID...';

    // Toggle parcel layer
    const toggleParcels = document.getElementById('toggleParcels');
    if (toggleParcels) {
      toggleParcels.addEventListener('change', (e) => {
        if (typeof MapInteraction !== 'undefined') {
          MapInteraction.toggleParcelLayer(e.target.checked);
        }
      });
    }
  };

  /**
   * Handle property selection
   * @param {object} property - Selected property
   */
  const handlePropertySelected = (property) => {
    console.log('Property selected:', property.address);

    // Display property information
    PropertyDisplay.displayProperty(property);

    console.log('Property view ready');
  };

  /**
   * Cleanup on page unload
   */
  const cleanup = () => {
    console.log('Cleaning up application...');
  };

  // Listen for page unload
  window.addEventListener('beforeunload', cleanup);

  // Public API
  return {
    init,
    handlePropertySelected,
  };
})();

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);

// Log initialization for debugging
console.log('Property Owner Widget Scripts Loaded');
