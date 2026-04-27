/**
 * Main Module for Tax Assessor Review Interface
 * Initializes and connects all modules
 */

const App = (() => {
  let loadingCoverMinElapsed = false;
  let loadingCoverReady = false;
  /**
   * Initialize the entire application
   */
  const init = async () => {
    console.log('Initializing Tax Assessor Review Application...');

    window.setTimeout(() => {
      loadingCoverMinElapsed = true;
      hideLoadingCoverIfReady();
    }, 1400);

    try {
      // Step 1: Initialize popup module
      PropertyPopup.init();
      console.log('�?Property Popup initialized');

      // Step 2: Load real property data from GCS GeoJSON
      console.log('📥 Loading property data from GeoJSON...');
      const properties = await DataManager.loadGeoJSON();
      console.log(`�?Loaded ${properties.length} properties`);

      // Step 3: Initialize map AFTER data is loaded
      console.log('🗺�?Initializing map...');
      MapInteraction.init({
        center: [-75.16379, 39.95233], // Philadelphia City Hall
        zoom: 14.6,
      });
      console.log('�?Map initialized');

      // Step 4: Wait a moment for map to fully load, then load properties
      setTimeout(() => {
        MapInteraction.loadPropertyData(properties);
        console.log('�?Properties loaded on map');
      }, 500);

      // Step 5: Initialize distribution charts (Issue #18 & #19)
      DistributionChart.init();
      console.log('�?Distribution charts initialized');

      // Step 6: Initialize chart filtering
      ChartFiltering.init(handleFilterChange);
      ChartFiltering.configureRanges?.(DataManager.getFilterExtents());
      console.log('�?Chart filtering initialized');

      if (typeof AssessorSidebar !== 'undefined') {
        AssessorSidebar.init();
      }

      // Step 7: Setup event listeners
      setupEventListeners();
      console.log('�?Event listeners setup');

      // Step 8: Display initial statistics
      displayStatistics();
      updateFilteredResultCount(DataManager.getFilteredProperties());
      console.log('�?Statistics displayed');

      // Step 9: Display initial data
      displayFilteredProperties();
      console.log('�?Initial data loaded');

      // Step 10: Render sidebar distribution mini-charts
      renderSidebarCharts();
      if (typeof AssessorSidebar !== 'undefined') {
        AssessorSidebar.renderDefault();
      }
      console.log('�?Sidebar distribution charts rendered');

      console.log('Application ready!');
      loadingCoverReady = true;
      hideLoadingCoverIfReady();
    } catch (error) {
      console.error('�?Error initializing application:', error);
      PropertyPopup.showNotification(
        'Error loading application. Please refresh.',
        'error'
      );
      loadingCoverReady = true;
      hideLoadingCoverIfReady();
    }
  };

  /**
   * Handle filter change from chart filtering module
   * @param {array} filteredProperties - Filtered properties array
   */
  const handleFilterChange = (filteredProperties) => {
    console.log(
      `Filters applied: ${filteredProperties.length} properties displayed`
    );

    // Update map
    MapInteraction.updateWithFilteredData(filteredProperties);

    // Update statistics
    displayStatistics();
    updateFilteredResultCount(filteredProperties);

    // Update table/display
    displayFilteredProperties();

    // Update charts if they exist
    updateCharts();

    // Refresh sidebar mini-charts for the filtered set
    renderSidebarCharts();
    ChartFiltering?.syncUiFromFilters?.();
    if (typeof AssessorSidebar !== 'undefined') {
      AssessorSidebar.refresh();
    }
  };

  /**
   * Render the two sidebar distribution mini-charts using filtered data
   */
  const renderSidebarCharts = () => {
    if (typeof DistributionChart === 'undefined') return;
    const properties = DataManager.getFilteredProperties();
    const activePredictedBin =
      AssessorSidebar?.getActiveDistributionBin?.('predicted') || null;
    const activeMarketBin =
      AssessorSidebar?.getActiveDistributionBin?.('market') || null;
    if (typeof DistributionChart.renderSidebarPrice === 'function') {
      DistributionChart.renderSidebarPrice(properties, {
        onBarClick: (bin) =>
          AssessorSidebar?.applyDistributionBinFilter?.('predicted', bin),
        activeBin: activePredictedBin,
      });
    }
    if (typeof DistributionChart.renderSidebarMarket === 'function') {
      DistributionChart.renderSidebarMarket(properties, {
        onBarClick: (bin) =>
          AssessorSidebar?.applyDistributionBinFilter?.('market', bin),
        activeBin: activeMarketBin,
      });
    }
  };

  /**
   * Display statistics in sidebar
   */
  const displayStatistics = () => {
    const stats = DataManager.getStatistics();

    // Update total increased count
    const totalIncreasedCard = document.getElementById('statTotalIncreased');
    if (totalIncreasedCard) {
      const valueDiv = totalIncreasedCard.querySelector('.text-2xl');
      if (valueDiv) {
        valueDiv.textContent = stats.increasedCount.toLocaleString();
      }
    }

    // Update average increase percentage
    const avgIncreaseCard = document.getElementById('statAvgIncrease');
    if (avgIncreaseCard) {
      const valueDiv = avgIncreaseCard.querySelector('.text-2xl');
      if (valueDiv) {
        const avgChangePercent = stats.changeStats.mean.toFixed(1);
        valueDiv.textContent = `${avgChangePercent}%`;
      }
    }

    if (stats.totalCount > 0) {
      console.log('Statistics Updated:', {
        totalCount: stats.totalCount,
        increasedCount: stats.increasedCount,
        avgChange: stats.changeStats.mean.toFixed(1),
      });
    }
  };

  /**
   * Display filtered properties
   */
  const displayFilteredProperties = () => {
    const properties = DataManager.getFilteredProperties();
    console.log(`Displaying ${properties.length} properties`);

    // Update map with properties
    MapInteraction.loadPropertyData(properties);

    // Update any list displays if they exist
    const propertyList = document.getElementById('propertyList');
    if (propertyList) {
      renderPropertyList(properties, propertyList);
    }
  };

  /**
   * Render property list (if list view exists)
   * @param {array} properties - Properties to render
   * @param {element} container - Container element
   */
  const renderPropertyList = (properties, container) => {
    // Clear existing content
    container.innerHTML = '';

    if (properties.length === 0) {
      container.innerHTML = '<div class="p-4 text-center text-[#e2e2e2]/60">No properties found</div>';
      return;
    }

    // Limit to first 20 for performance
    const displayProps = properties.slice(0, 20);

    displayProps.forEach((p) => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'property-list-item cursor-pointer p-3 border-b border-[#e2e2e2]/10 hover:bg-[#121414] transition-colors';

      const changeColor = p.change_percent > 0 ? 'text-[#ffb2b6]' : 'text-[#a0caff]';

      itemDiv.innerHTML = `
        <div class="flex items-start justify-between">
          <div>
            <div class="font-600 text-sm">${p.address}</div>
            <div class="text-xs text-[#e2e2e2]/40 mt-1">${p.id}</div>
          </div>
          <div class="text-right">
            <div class="font-600 text-sm">${Utils.formatCurrency(p.tax_year_value)}</div>
            <div class="text-xs ${changeColor} mt-1">
              ${p.change_percent > 0 ? '+' : ''}${Utils.formatPercentage(p.change_percent)}
            </div>
          </div>
        </div>
      `;

      // Add click event listener
      itemDiv.addEventListener('click', () => {
        MapInteraction.highlightProperty(p.id);
        PropertyPopup.open(p);
      });

      container.appendChild(itemDiv);
    });

    // Show count if more than 20
    if (properties.length > 20) {
      const moreDiv = document.createElement('div');
      moreDiv.className = 'p-3 text-center text-xs text-[#e2e2e2]/40';
      moreDiv.textContent = `Showing 20 of ${properties.length} properties`;
      container.appendChild(moreDiv);
    }
  };

  /**
   * Update charts (placeholder for chart updates)
   */
  const updateCharts = () => {
    // Get distribution data
    const priceDistribution = DataManager.getDistributionData('price', 10);
    const changeDistribution = DataManager.getDistributionData('change', 10);

    console.log('Chart data updated:', {
      priceDistributionBins: priceDistribution.length,
      changeDistributionBins: changeDistribution.length,
    });

    // Update chart visualizations here
    // This will be connected to actual charting library
  };

  /**
   * Setup event listeners for UI controls
   */
  const setupEventListeners = () => {
    // Download CSV button
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        DataManager.downloadCSV();
        PropertyPopup.showNotification('Data downloaded successfully', 'success');
      });
    }

    // Toggle layers
    const toggleParcels = document.getElementById('toggleParcels');
    if (toggleParcels) {
      toggleParcels.addEventListener('change', (e) => {
        MapInteraction.toggleParcelLayer(e.target.checked);
      });
    }

    const toggleChoropleth = document.getElementById('toggleChoropleth');
    if (toggleChoropleth) {
      toggleChoropleth.addEventListener('change', (e) => {
        MapInteraction.toggleChoropleth(e.target.checked);
      });
    }

    if (toggleParcels) {
      MapInteraction.toggleParcelLayer(toggleParcels.checked);
    }
    if (toggleChoropleth) {
      MapInteraction.toggleChoropleth(toggleChoropleth.checked);
    }

    const basemapSelect = document.getElementById('basemapSelect');
    if (basemapSelect) {
      basemapSelect.addEventListener('change', (e) => {
        MapInteraction.setBasemap(e.target.value);
      });
    }


    // Fit bounds button (if exists)
    const fitBoundsBtn = document.getElementById('fitBoundsBtn');
    if (fitBoundsBtn) {
      fitBoundsBtn.addEventListener('click', () => {
        MapInteraction.fitToBounds();
      });
    }

    // Export button (if exists)
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const csv = DataManager.exportCSV();
        console.log('Export data:', csv);
        PropertyPopup.showNotification('Data prepared for export', 'info');
      });
    }
  };

  /**
   * Cleanup on page unload
   */
  const cleanup = () => {
    console.log('Cleaning up application...');
    // Add cleanup logic as needed
  };

  const hideLoadingCoverIfReady = () => {
    if (!loadingCoverReady || !loadingCoverMinElapsed) return;

    const cover = document.getElementById('reviewerLoadingCover');
    if (!cover || cover.classList.contains('is-hidden')) return;

    cover.classList.add('is-hidden');
  };

  const updateFilteredResultCount = (properties = []) => {
    const resultCount = document.getElementById('filteredResultCount');
    if (!resultCount) return;

    resultCount.textContent = `Filtered parcels: ${properties.length.toLocaleString()}`;
  };

  // Listen for page unload
  window.addEventListener('beforeunload', cleanup);

  // Public API
  return {
    init,
    handleExternalFilterRefresh: () =>
      handleFilterChange(DataManager.getFilteredProperties()),
  };
})();

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);

// Log initialization for debugging
console.log('Tax Assessor Review Application Scripts Loaded');


