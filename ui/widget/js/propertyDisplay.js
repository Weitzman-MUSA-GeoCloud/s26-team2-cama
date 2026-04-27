/**
 * Property Display Module for Property Owner Widget
 * Handles displaying property information, nearby comparisons, and map updates.
 */

const PropertyDisplay = (() => {
  let currentProperty = null;
  let neighborhoodProperties = [];
  let nearbyPanelMode = 'ml';
  let sameTypePanelExpanded = false;
  let nearbyPanelDismissed = false;
  let nearbyPanelDragged = false;

  const NEARBY_RADIUS_METERS = 250;

  const init = () => {
    console.log('Initializing Property Display Module...');
    setupEventListeners();
    enableNearbyPanelDragging();
  };

  const displayProperty = (property) => {
    if (!property) {
      console.error('No property provided to displayProperty');
      return;
    }

    currentProperty = property;
    nearbyPanelDismissed = false;

    updatePropertyInfo(property);
    updateNearbyChange(property);
    showSections();

    if (typeof MapInteraction !== 'undefined') {
      MapInteraction.loadPropertyData([property]);
      MapInteraction.showNearbyRing(property.lng, property.lat, NEARBY_RADIUS_METERS);
    }
  };

  const updatePropertyInfo = (property) => {
    setElementText('propertyAddress', property.address);
    setElementText('propertyId', property.id);
    setElementText('propertyType', property.property_type);
    setElementText('propertyLotSize', Utils.formatLotSize(property.lot_size));

    const lastValue = Number.isFinite(property.last_year_value)
      ? property.last_year_value
      : property.tax_year_value;
    const currentValue = Number.isFinite(property.predicted_value)
      ? property.predicted_value
      : null;

    setElementText('propertyLastValue', Utils.formatCurrency(lastValue));
    setElementText('propertyLastYear', `(${new Date().getFullYear() - 1})`);

    setElementText('propertyCurrentValue', Utils.formatCurrency(currentValue));
    setElementText(
      'propertyCurrentYear',
      Number.isFinite(currentValue)
        ? `(${new Date().getFullYear()})`
        : '(No ML prediction)'
    );

    const dollarChange =
      Number.isFinite(currentValue) && Number.isFinite(lastValue)
        ? currentValue - lastValue
        : null;
    const percentChange =
      Number.isFinite(currentValue) && Number.isFinite(lastValue)
        ? Utils.calculatePercentChange(lastValue, currentValue)
        : null;

    setElementText('changeAmount', Utils.formatCurrency(dollarChange));
    setElementText('changePercent', Utils.formatPercentage(percentChange));
    setElementText('propertyLatestSale', Utils.formatCurrency(property.sale_price));
    setElementText('propertySaleDate', formatSaleDate(property.sale_date));

    const changeBar = document.getElementById('changeBar');
    if (changeBar) {
      const barWidth = Number.isFinite(percentChange)
        ? Math.min(Math.abs(percentChange), 100)
        : 0;
      changeBar.style.width = `${barWidth}%`;
      changeBar.style.backgroundColor =
        Number.isFinite(percentChange) && percentChange > 0
          ? '#ffb2b6'
          : '#a0caff';
    }
  };

  const updateNearbyChange = (property) => {
    const allProperties =
      typeof Search !== 'undefined' && typeof Search.getAllProperties === 'function'
        ? Search.getAllProperties()
        : [];

    const hasPrediction = Number.isFinite(property.predicted_value);
    nearbyPanelMode = hasPrediction ? 'ml' : 'context';

    const nearbyWithPredictions = allProperties
      .filter((candidate) => isNearbyPredictedProperty(property, candidate))
      .map((candidate) => ({
        ...candidate,
        change_percent: getPropertyChangePercent(candidate),
        distance_m: getDistanceMeters(
          property.lat,
          property.lng,
          candidate.lat,
          candidate.lng
        ),
      }))
      .filter((candidate) => Number.isFinite(candidate.change_percent));

    const comparableNearby = allProperties
      .filter((candidate) => isComparableNearbyProperty(property, candidate))
      .map((candidate) => ({
        ...candidate,
        change_percent: getPropertyChangePercent(candidate),
        distance_m: getDistanceMeters(
          property.lat,
          property.lng,
          candidate.lat,
          candidate.lng
        ),
      }))
      .filter((candidate) => Number.isFinite(candidate.change_percent));

    neighborhoodProperties = hasPrediction ? comparableNearby : nearbyWithPredictions;

    const activeNearby = neighborhoodProperties;

    const nearbyAverage = activeNearby.length
      ? activeNearby.reduce((sum, candidate) => sum + candidate.change_percent, 0) /
        activeNearby.length
      : null;
    const yourChange = getPropertyChangePercent(property);

    setNearbyPanelLabels(property, activeNearby.length);
    setElementText('nearbyAverageChange', Utils.formatPercentage(nearbyAverage));
    setElementText(
      'nearbyYourChange',
      hasPrediction ? Utils.formatPercentage(yourChange) : String(activeNearby.length)
    );
    setElementText(
      'nearbyStatus',
      getNearbyStatusText(property, yourChange, nearbyAverage, activeNearby.length)
    );
    setElementText(
      'nearbyYourMarkerLabel',
      hasPrediction ? 'Your home' : 'Nearby homes with predictions'
    );

    renderNearbyHistogram(activeNearby, hasPrediction ? yourChange : null);
    renderSameTypeHomes(property, activeNearby);
  };

  const setNearbyPanelLabels = (property, nearbyCount) => {
    const hasPrediction = Number.isFinite(property.predicted_value);
    setElementText('nearbyPrimaryLabel', 'Nearby average');
    setElementText(
      'nearbySecondaryLabel',
      hasPrediction ? 'Your property' : 'Nearby homes with prediction'
    );
    setElementText(
      'sameTypeHomesLabel',
      hasPrediction ? 'Same Property Type' : 'Nearby examples'
    );

    const toggle = document.getElementById('toggleSameTypeHomes');
    if (toggle) {
      toggle.textContent = sameTypePanelExpanded
        ? hasPrediction
          ? 'Hide same Property Type'
          : 'Hide nearby examples'
        : hasPrediction
          ? 'Show same Property Type'
          : 'Show nearby examples';
    }

    const nearbyCountNote = document.getElementById('nearbyCountNote');
    if (nearbyCountNote) {
      nearbyCountNote.textContent = hasPrediction
        ? ''
        : nearbyCount > 0
          ? 'Nearby context is based on homes within 250m that have predictions.'
          : 'No nearby homes with prediction data were found within 250m.';
    }
  };

  const isNearbyPredictedProperty = (selectedProperty, candidate) => {
    if (!candidate || String(candidate.id) === String(selectedProperty.id)) return false;
    if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) return false;
    if (!Number.isFinite(selectedProperty.lat) || !Number.isFinite(selectedProperty.lng)) {
      return false;
    }
    if (!Number.isFinite(candidate.last_year_value) || !Number.isFinite(candidate.predicted_value)) {
      return false;
    }

    return (
      getDistanceMeters(
        selectedProperty.lat,
        selectedProperty.lng,
        candidate.lat,
        candidate.lng
      ) <= NEARBY_RADIUS_METERS
    );
  };

  const isComparableNearbyProperty = (selectedProperty, candidate) => {
    if (!candidate || String(candidate.id) === String(selectedProperty.id)) return false;
    if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) return false;
    if (!Number.isFinite(selectedProperty.lat) || !Number.isFinite(selectedProperty.lng)) {
      return false;
    }
    if (!Number.isFinite(candidate.last_year_value) || !Number.isFinite(candidate.predicted_value)) {
      return false;
    }

    const selectedType = normalizeType(selectedProperty.property_type);
    const candidateType = normalizeType(candidate.property_type);
    if (!selectedType || !candidateType || selectedType !== candidateType) return false;

    return (
      getDistanceMeters(
        selectedProperty.lat,
        selectedProperty.lng,
        candidate.lat,
        candidate.lng
      ) <= NEARBY_RADIUS_METERS
    );
  };

  const normalizeType = (value) => String(value || '').trim().toLowerCase();

  const getPropertyChangePercent = (property) => {
    const lastValue = Number.isFinite(property.last_year_value)
      ? property.last_year_value
      : property.tax_year_value;
    const currentValue = Number.isFinite(property.predicted_value)
      ? property.predicted_value
      : null;

    if (!Number.isFinite(lastValue) || !Number.isFinite(currentValue) || lastValue <= 0) {
      return null;
    }

    return Utils.calculatePercentChange(lastValue, currentValue);
  };

  const getNearbyStatusText = (property, yourChange, nearbyAverage, comparableCount) => {
    const hasPrediction = Number.isFinite(property.predicted_value);
    if (!comparableCount) {
      return hasPrediction
        ? 'No nearby homes of the same property type with enough data.'
        : 'No prediction is available for this property, and no nearby predicted homes were found.';
    }
    if (!hasPrediction) {
      return 'No prediction is available for this property. Showing nearby market change for local context.';
    }
    if (!Number.isFinite(nearbyAverage)) {
      return 'Nearby comparison is not available right now.';
    }
    const betterThanCount = neighborhoodProperties.filter(
      (candidate) => Number.isFinite(candidate.change_percent) && yourChange > candidate.change_percent
    ).length;
    const percentile = Math.round((betterThanCount / comparableCount) * 100);

    if (percentile >= 95) {
      return `Higher than ${percentile}% of nearby homes`;
    }
    if (percentile >= 55) {
      return `Higher than ${percentile}% of nearby homes`;
    }
    if (percentile <= 5) {
      return `Higher than ${percentile}% of nearby homes`;
    }
    return `Higher than ${percentile}% of nearby homes`;
  };

  const renderNearbyHistogram = (comparableNearby, yourChange) => {
    const histogram = document.getElementById('nearbyHistogram');
    if (!histogram) return;

    histogram.innerHTML = '';
    histogram.classList.remove('empty');

    if (!comparableNearby.length) {
      histogram.classList.add('empty');
      histogram.textContent = 'No nearby comparable homes.';
      return;
    }

    const values = comparableNearby
      .map((property) => property.change_percent)
      .filter(Number.isFinite);
    if (!values.length) {
      histogram.classList.add('empty');
      histogram.textContent = 'No nearby change values available.';
      return;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = 8;
    const range = max - min || 1;
    const binWidth = range / binCount;
    const bins = Array.from({ length: binCount }, () => 0);

    values.forEach((value) => {
      const rawIndex = Math.floor((value - min) / binWidth);
      const index = Math.max(0, Math.min(binCount - 1, rawIndex));
      bins[index] += 1;
    });

    const maxBin = Math.max(...bins, 1);
    const yourBinIndex = Number.isFinite(yourChange)
      ? Math.max(0, Math.min(binCount - 1, Math.floor((yourChange - min) / binWidth)))
      : -1;

    bins.forEach((count, index) => {
      const bar = document.createElement('div');
      bar.className = `nearby-bar${index === yourBinIndex ? ' your-bin' : ''}`;
      bar.style.height = `${Math.max(6, (count / maxBin) * 72)}px`;
      histogram.appendChild(bar);
    });

    if (Number.isFinite(yourChange)) {
      const marker = document.createElement('div');
      marker.className = 'nearby-histogram-marker';
      const markerRatio = (yourChange - min) / range;
      marker.style.left = `calc(${Math.max(0, Math.min(1, markerRatio)) * 100}% - 1px)`;
      histogram.appendChild(marker);

      const markerArrow = document.createElement('div');
      markerArrow.className = 'nearby-histogram-marker-arrow';
      markerArrow.style.left = `calc(${Math.max(0, Math.min(1, markerRatio)) * 100}% - 6px)`;
      histogram.appendChild(markerArrow);
    }
  };

  const renderSameTypeHomes = (property, comparableNearby) => {
    const list = document.getElementById('sameTypeHomesList');
    if (!list) return;

    list.innerHTML = '';
    const hasPrediction = Number.isFinite(property.predicted_value);

    if (!comparableNearby.length) {
      list.innerHTML =
        `<div class="text-xs text-[#e2e2e2]/50 px-1 py-2">${
          hasPrediction
            ? 'No nearby homes of the same type found.'
            : 'No nearby examples with prediction data were found.'
        }</div>`;
      return;
    }

    const descending = [...comparableNearby]
      .sort((a, b) => a.change_percent - b.change_percent)
      .slice(0, 2)
      .map((property) => ({ ...property, direction: 'Largest decrease' }));
    const ascending = [...comparableNearby]
      .sort((a, b) => b.change_percent - a.change_percent)
      .slice(0, 2)
      .map((property) => ({ ...property, direction: 'Largest increase' }));

    const uniqueHomes = [];
    [...descending, ...ascending].forEach((property) => {
      if (!uniqueHomes.some((existing) => existing.id === property.id)) {
        uniqueHomes.push(property);
      }
    });

    uniqueHomes.forEach((property) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nearby-home-button';
      button.innerHTML = `
        <span class="nearby-home-meta">
          <span class="nearby-home-address">${property.address}</span>
          <span class="nearby-home-direction">${property.direction}</span>
        </span>
        <span class="nearby-home-change ${property.change_percent >= 0 ? 'up' : 'down'}">
          ${Utils.formatPercentage(property.change_percent)}
        </span>
      `;
      button.addEventListener('click', () => {
        displayProperty(property);
      });
      list.appendChild(button);
    });
  };

  const getDistanceMeters = (lat1, lng1, lat2, lng2) => {
    const toRadians = (value) => (value * Math.PI) / 180;
    const earthRadius = 6371000;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const showSections = () => {
    document.getElementById('ownerIntroBlock')?.classList.add('hidden');
    document.getElementById('ownerExamplesBlock')?.classList.add('hidden');

    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
      emptyState.classList.add('hidden');
    }

    const propertySection = document.getElementById('propertySection');
    if (propertySection) {
      propertySection.classList.remove('hidden');
    }

    const nearbyMapPanel = document.getElementById('nearbyMapPanel');
    if (nearbyMapPanel && !nearbyPanelDismissed) {
      nearbyMapPanel.classList.remove('nearby-map-panel-hidden');
      nearbyMapPanel.style.display = 'block';
      if (!nearbyPanelDragged) {
        nearbyMapPanel.style.top = '18px';
        nearbyMapPanel.style.right = '18px';
        nearbyMapPanel.style.left = 'auto';
      }
    }
  };

  const hideSections = () => {
    document.getElementById('ownerIntroBlock')?.classList.remove('hidden');
    document.getElementById('ownerExamplesBlock')?.classList.remove('hidden');

    const propertySection = document.getElementById('propertySection');
    if (propertySection) {
      propertySection.classList.add('hidden');
    }

    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
      emptyState.classList.remove('hidden');
    }

    const nearbyMapPanel = document.getElementById('nearbyMapPanel');
    if (nearbyMapPanel) {
      nearbyMapPanel.classList.add('nearby-map-panel-hidden');
      nearbyMapPanel.style.display = 'none';
    }
  };

  const setElementText = (elementId, text) => {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = text ?? '-';
    }
  };

  const formatSaleDate = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getCurrentProperty = () => currentProperty;

  const getNeighborhoodProperties = () => neighborhoodProperties;

  const clear = () => {
    currentProperty = null;
    neighborhoodProperties = [];
    hideSections();
    if (typeof MapInteraction !== 'undefined') {
      MapInteraction.clearNearbyRing();
    }
  };

  const setupEventListeners = () => {
    const toggleSameTypeHomes = document.getElementById('toggleSameTypeHomes');
    if (toggleSameTypeHomes) {
      toggleSameTypeHomes.addEventListener('click', () => {
        sameTypePanelExpanded = !sameTypePanelExpanded;
        const panel = document.getElementById('sameTypeHomesPanel');
        if (panel) {
          panel.classList.toggle('hidden', !sameTypePanelExpanded);
        }
        toggleSameTypeHomes.textContent = sameTypePanelExpanded
          ? nearbyPanelMode === 'ml'
            ? 'Hide same Property Type'
            : 'Hide nearby examples'
          : nearbyPanelMode === 'ml'
            ? 'Show same Property Type'
            : 'Show nearby examples';
      });
    }

    const closeNearbyMapPanel = document.getElementById('closeNearbyMapPanel');
    if (closeNearbyMapPanel) {
      closeNearbyMapPanel.addEventListener('click', () => {
        nearbyPanelDismissed = true;
        const nearbyMapPanel = document.getElementById('nearbyMapPanel');
        if (nearbyMapPanel) {
          nearbyMapPanel.classList.add('nearby-map-panel-hidden');
          nearbyMapPanel.style.display = 'none';
        }
      });
    }
  };

  const enableNearbyPanelDragging = () => {
    const panel = document.getElementById('nearbyMapPanel');
    const handle = document.getElementById('nearbyMapHeader');
    const map = document.getElementById('map');
    if (!panel || !handle || !map) return;

    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let dragging = false;

    handle.addEventListener('mousedown', (event) => {
      if (event.target.closest('#closeNearbyMapPanel')) return;
      dragging = true;
      nearbyPanelDragged = true;

      const panelRect = panel.getBoundingClientRect();
      const mapRect = map.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startLeft = panelRect.left - mapRect.left;
      startTop = panelRect.top - mapRect.top;

      panel.style.left = `${startLeft}px`;
      panel.style.top = `${startTop}px`;
      panel.style.right = 'auto';
      document.body.style.userSelect = 'none';
      event.preventDefault();
    });

    window.addEventListener('mousemove', (event) => {
      if (!dragging) return;
      const mapRect = map.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const maxLeft = Math.max(0, mapRect.width - panelRect.width);
      const maxTop = Math.max(0, mapRect.height - panelRect.height);

      const nextLeft = Math.min(
        maxLeft,
        Math.max(0, startLeft + (event.clientX - startX))
      );
      const nextTop = Math.min(
        maxTop,
        Math.max(0, startTop + (event.clientY - startY))
      );

      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
    });
  };

  return {
    init,
    displayProperty,
    getCurrentProperty,
    getNeighborhoodProperties,
    clear,
  };
})();
