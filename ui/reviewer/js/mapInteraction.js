/**
 * Map Interaction Module for Tax Assessor Review Interface
 * Handles Maplibre GL JS map initialization and property interactions
 */

const MapInteraction = (() => {
  let mapContainer = null;
  let map = null;
  let currentlyHighlighted = null;
  let selectedProperty = null;
  let currentTileFilter = ['all'];
  let selectedMarker = null;
  let choroplethEnabled = false;
  let metadata = null;
  let currentBasemap = 'light';
  const VECTOR_TILE_URL =
    'https://storage.googleapis.com/musa5090s26-team2-public/tiles/properties/{z}/{x}/{y}.pbf';
  const VECTOR_SOURCE_LAYER = 'property_tile_info';
  const METADATA_URL =
    'https://storage.googleapis.com/musa5090s26-team2-public/configs/map_style_metadata.json';
  const BASEMAPS = {
    light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    satellite: {
      version: 8,
      sources: {
        esri: {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: 'Esri',
        },
      },
      layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
    },
  };

  /**
   * Initialize map with Maplibre GL JS
   * @param {object} options - Map configuration options
   */
  const init = (options = {}) => {
    // Get map container on init (not on module load)
    mapContainer = document.getElementById('map');

    if (!mapContainer) {
      console.error('❌ Map container not found');
      return;
    }

    if (typeof maplibregl === 'undefined') {
      console.error('❌ Maplibre GL JS not loaded');
      return;
    }

    console.log('✓ Starting map initialization...');

    // Default map options
    const defaultOptions = {
      container: mapContainer,
      style: options.style || BASEMAPS.light,
      center: options.center || [-75.1652, 39.9526], // Philadelphia center
      zoom: options.zoom || 11,
      pitch: 0,
      bearing: 0,
    };

    try {
      map = new maplibregl.Map(defaultOptions);

      // Add map controls
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

      // When map loads, add layers and event listeners
      map.on('load', () => {
        console.log('Map loaded successfully');
        hidePlaceholder();
        loadStyleMetadata();
        setupMapLayers();
        setupMapEvents();
        loadPropertyData();
      });

      map.on('error', (e) => {
        console.error('Map error:', e);
      });
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  };

  /**
   * Setup map layers for properties
   */
  const setupMapLayers = () => {
    if (!map) return;

    // Idempotent: only add if missing (setStyle wipes them, but guard anyway)
    if (!map.getSource('property-parcels')) {
      map.addSource('property-parcels', {
        type: 'vector',
        tiles: [VECTOR_TILE_URL],
        minzoom: 12,
        maxzoom: 18,
      });
    }

    if (!map.getLayer('property-parcels-fill')) {
      map.addLayer({
        id: 'property-parcels-fill',
        type: 'fill',
        source: 'property-parcels',
        'source-layer': VECTOR_SOURCE_LAYER,
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'predicted_value'],
            0, '#2b83ba',
            150000, '#00a6ca',
            250000, '#00ccbc',
            375000, '#90eb9d',
            500000, '#ffff8c',
            750000, '#f9d057',
            1000000, '#f29e2e',
            2000000, '#d7191c',
          ],
          'fill-opacity': 0.04,
        },
      });
    }

    if (!map.getLayer('property-parcels-outline')) {
      map.addLayer({
        id: 'property-parcels-outline',
        type: 'line',
        source: 'property-parcels',
        'source-layer': VECTOR_SOURCE_LAYER,
        paint: {
          'line-color': '#101414',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            11, 0.15,
            15, 0.6,
            18, 1.2,
          ],
          'line-opacity': 0.72,
        },
      });
    }

    if (!map.getLayer('property-parcels-highlight')) {
      map.addLayer({
        id: 'property-parcels-highlight',
        type: 'fill',
        source: 'property-parcels',
        'source-layer': VECTOR_SOURCE_LAYER,
        paint: {
          'fill-color': '#ffe66d',
          'fill-opacity': 0.35,
        },
        filter: ['==', ['to-string', ['get', 'property_id']], ''],
      });
    }

    if (!map.getLayer('property-parcels-highlight-outline')) {
      map.addLayer({
        id: 'property-parcels-highlight-outline',
        type: 'line',
        source: 'property-parcels',
        'source-layer': VECTOR_SOURCE_LAYER,
        paint: {
          'line-color': '#ffe66d',
          'line-width': 3,
          'line-opacity': 1,
        },
        filter: ['==', ['to-string', ['get', 'property_id']], ''],
      });
    }

    // Make parcel outlines readable against whichever basemap is active
    applyOutlineStyleForBasemap();
  };

  /**
   * On satellite imagery the dark outline blends into the tiles and the
   * parcels appear to vanish; brighten the outline + up the opacity when
   * we're on satellite, and restore the original dark outline on light.
   */
  const applyOutlineStyleForBasemap = () => {
    if (!map?.getLayer('property-parcels-outline')) return;
    if (currentBasemap === 'satellite') {
      map.setPaintProperty('property-parcels-outline', 'line-color', '#ffffff');
      map.setPaintProperty('property-parcels-outline', 'line-opacity', 0.65);
    } else {
      map.setPaintProperty('property-parcels-outline', 'line-color', '#101414');
      map.setPaintProperty('property-parcels-outline', 'line-opacity', 0.72);
    }
  };

  /**
   * Setup map event listeners
   */
  const setupMapEvents = () => {
    if (!map) return;

    // Click on property parcel
    map.on('click', 'property-parcels-fill', (e) => {
      if (e.features.length > 0) {
        handleParcelClick(e.features[0]);
      }
    });

    // Hover over parcel
    map.on('mousemove', 'property-parcels-fill', (e) => {
      if (e.features.length > 0) {
        const propertyId = e.features[0].properties.property_id;
        highlightProperty(propertyId);
      }
    });

    map.on('mouseenter', 'property-parcels-fill', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'property-parcels-fill', () => {
      map.getCanvas().style.cursor = '';
      if (!selectedProperty) clearHighlight();
    });

    map.on('click', (e) => {
      const parcelHits = map.queryRenderedFeatures(e.point, {
        layers: ['property-parcels-fill'],
      });
      if (parcelHits.length === 0 && !selectedProperty) clearHighlight();
    });
  };

  /**
   * Load property data onto map
   * @param {array} properties - Property objects to display
   */
  const loadPropertyData = (properties = null) => {
    if (!map) return;
    map.resize();
    applyTileFiltersFromDataManager();
  };

  /**
   * Handle parcel click from vector tiles
   * @param {object} feature - Map feature object
   */
  const handleParcelClick = (feature) => {
    const propertyId = feature.properties.property_id;
    const property = DataManager.getPropertyById(propertyId);

    if (!property) {
      // If property not in local data, show parcel information from GeoJSON
      showParcelInfo(feature);
      return;
    }

    selectedProperty = property;
    highlightProperty(propertyId);
    showMarker(property);
    if (typeof AssessorSidebar !== 'undefined') {
      AssessorSidebar.showProperty(property);
    } else {
      PropertyPopup.open(property);
    }

    flyToProperty([property.lng, property.lat]);
  };

  /**
   * Show parcel information popup
   * @param {object} feature - Parcel feature
   */
  const showParcelInfo = (feature) => {
    const props = feature.properties;
    const lastYearValue = props.log_price ? Math.exp(Number(props.log_price)) : Number(props.predicted_value || 0);
    const predictedValue = Number(props.predicted_value || 0);

    // Map GeoJSON properties to expected format
    const info = {
      id: String(props.property_id || ''),
      address: props.address || 'Address not available',
      tax_year_value: lastYearValue,
      predicted_value: predictedValue,
      change_percent: lastYearValue ? ((predictedValue - lastYearValue) / lastYearValue) * 100 : 0,
      property_type: props.bldg_desc || 'Unknown',
      last_inspection: null,
    };

    if (typeof PropertyPopup !== 'undefined') {
      if (typeof AssessorSidebar !== 'undefined') {
        AssessorSidebar.showProperty(info);
      } else {
        PropertyPopup.open(info);
      }
    } else {
      console.log('Parcel information:', info);
    }
  };

  /**
   * Highlight property on map
   * @param {string} propertyId - Property ID to highlight
   */
  const highlightProperty = (propertyId) => {
    if (!map) return;

    currentlyHighlighted = String(propertyId);
    const filter = [
      '==',
      ['to-string', ['get', 'property_id']],
      currentlyHighlighted,
    ];
    ['property-parcels-highlight', 'property-parcels-highlight-outline'].forEach(
      (layerId) => {
        if (map.getLayer(layerId)) map.setFilter(layerId, filter);
      }
    );
  };

  /**
   * Fly to property location
   * @param {array} coordinates - [lng, lat] coordinates
   */
  const flyToProperty = (coordinates) => {
    if (!map) return;

    if (!Number.isFinite(coordinates?.[0]) || !Number.isFinite(coordinates?.[1])) return;

    // Zoom in on the parcel; never zoom out if user is already closer.
    const targetZoom = Math.max(map.getZoom(), 17);
    map.flyTo({
      center: coordinates,
      zoom: targetZoom,
      duration: 1200,
      essential: true,
    });
  };

  /**
   * Update map with filtered data
   * @param {array} filteredProperties - Filtered property array
   */
  const updateWithFilteredData = (filteredProperties) => {
    applyTileFiltersFromDataManager();
    loadPropertyData(filteredProperties);
  };

  const clearHighlight = () => {
    currentlyHighlighted = null;
    const emptyFilter = ['==', ['to-string', ['get', 'property_id']], ''];
    ['property-parcels-highlight', 'property-parcels-highlight-outline'].forEach(
      (layerId) => {
        if (map?.getLayer(layerId)) map.setFilter(layerId, emptyFilter);
      }
    );
  };

  // Kept for API compatibility — selection is now expressed only via the
  // parcel highlight layers (no point marker), matching the Atlas look.
  const showMarker = () => {
    selectedMarker?.remove();
    selectedMarker = null;
  };

  const clearSelection = () => {
    selectedProperty = null;
    selectedMarker?.remove();
    selectedMarker = null;
    clearHighlight();
  };

  const applyTileFiltersFromDataManager = () => {
    if (!map) return;

    const filters =
      typeof DataManager !== 'undefined'
        ? DataManager.getFilters()
        : {
            priceMin: 0,
            priceMax: 5000000,
            changeMin: -50,
            changeMax: 50,
          };

    currentTileFilter = buildTileFilter(filters);

    ['property-parcels-fill', 'property-parcels-outline'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, currentTileFilter);
      }
    });
  };

  const buildTileFilter = (filters) => {
    const priceMin = Number.isFinite(Number(filters.priceMin))
      ? Number(filters.priceMin)
      : 0;
    const priceMax = Number.isFinite(Number(filters.priceMax))
      ? Number(filters.priceMax)
      : 5000000;
    const changeMin = Number.isFinite(Number(filters.changeMin))
      ? Math.max(Number(filters.changeMin), -99.9)
      : -50;
    const changeMax = Number.isFinite(Number(filters.changeMax))
      ? Number(filters.changeMax)
      : 50;

    return [
      'all',
      ['>=', ['to-number', ['get', 'predicted_value']], priceMin],
      ['<=', ['to-number', ['get', 'predicted_value']], priceMax],
      [
        '>=',
        [
          '-',
          ['to-number', ['get', 'predicted_log_value']],
          ['to-number', ['get', 'log_price']],
        ],
        Math.log(1 + changeMin / 100),
      ],
      [
        '<=',
        [
          '-',
          ['to-number', ['get', 'predicted_log_value']],
          ['to-number', ['get', 'log_price']],
        ],
        Math.log(1 + changeMax / 100),
      ],
    ];
  };

  /**
   * Get map instance
   * @returns {object} Maplibre GL map object
   */
  const getMap = () => {
    return map;
  };

  /**
   * Get bounds of all properties
   * @returns {object} Bounds object or null
   */
  const getBounds = () => {
    if (!map) return null;

    const properties = DataManager.getFilteredProperties().filter(
      (p) => Number.isFinite(p.lng) && Number.isFinite(p.lat)
    );
    if (properties.length === 0) return null;

    let minLng = properties[0].lng;
    let maxLng = properties[0].lng;
    let minLat = properties[0].lat;
    let maxLat = properties[0].lat;

    properties.forEach((p) => {
      const { lng, lat } = p;
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });

    return { minLng, maxLng, minLat, maxLat };
  };

  /**
   * Fit map to bounds
   */
  const fitToBounds = () => {
    if (!map) return;

    const bounds = getBounds();
    if (!bounds) return;

    map.fitBounds(
      [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
      ],
      { padding: 50 }
    );
  };

  /**
   * Toggle parcel vector layer visibility
   * @param {boolean} visible - Visibility state
   */
  const toggleParcelLayer = (visible) => {
    if (!map) return;

    ['property-parcels-fill', 'property-parcels-outline'].forEach((layerId) => {
      const layer = map.getLayer(layerId);
      if (layer) {
        map.setLayoutProperty(
          layerId,
          'visibility',
          visible ? 'visible' : 'none'
        );
      }
    });
  };

  const toggleChoropleth = (enabled) => {
    choroplethEnabled = enabled;
    applyChoroplethStyle();
  };

  const applyChoroplethStyle = () => {
    if (!map?.getLayer('property-parcels-fill')) return;

    map.setPaintProperty(
      'property-parcels-fill',
      'fill-opacity',
      choroplethEnabled ? 0.74 : 0.04
    );

    if (!choroplethEnabled) {
      map.setPaintProperty('property-parcels-fill', 'fill-color', '#a0caff');
      return;
    }

    const breakpoints =
      metadata?.fields?.predicted_value?.breakpoints ||
      [0, 150000, 250000, 375000, 500000, 1000000];
    const colors = ['#2b83ba', '#00a6ca', '#00ccbc', '#90eb9d', '#f9d057', '#d7191c'];
    const expression = ['interpolate', ['linear'], ['to-number', ['get', 'predicted_value']]];
    breakpoints.forEach((value, index) => {
      expression.push(value, colors[index] || colors[colors.length - 1]);
    });
    map.setPaintProperty('property-parcels-fill', 'fill-color', expression);
    updateLegendLabels(breakpoints);
  };

  const loadStyleMetadata = async () => {
    try {
      const response = await fetch(METADATA_URL);
      if (!response.ok) throw new Error(`Metadata ${response.status}`);
      metadata = await response.json();
      applyChoroplethStyle();
    } catch (error) {
      console.warn('Unable to load map style metadata:', error);
    }
  };

  const updateLegendLabels = (breakpoints) => {
    const labels = document.getElementById('mapLegendLabels');
    if (!labels || !breakpoints?.length) return;
    const shown = [
      breakpoints[0],
      breakpoints[Math.floor(breakpoints.length / 2)],
      breakpoints[breakpoints.length - 2],
      breakpoints[breakpoints.length - 1],
    ];
    labels.innerHTML = shown
      .map((value) => `<span>${Utils.formatCurrency(value).replace('.00', '')}</span>`)
      .join('');
  };

  const setBasemap = (basemap) => {
    if (!map) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    const pitch = map.getPitch();

    currentBasemap = basemap in BASEMAPS ? basemap : 'light';
    const styleDef = BASEMAPS[currentBasemap];
    // Deep-clone inline style objects so MapLibre can't mutate our source-of-truth.
    const styleToApply =
      typeof styleDef === 'string' ? styleDef : JSON.parse(JSON.stringify(styleDef));

    const reinstateLayers = () => {
      setupMapLayers();
      setupMapEvents();
      applyTileFiltersFromDataManager();
      applyOutlineStyleForBasemap();

      // Re-sync UI toggle states that were wiped with the old style
      const parcelsCheckbox = document.getElementById('toggleParcels');
      if (parcelsCheckbox) toggleParcelLayer(parcelsCheckbox.checked);
      const choroplethCheckbox = document.getElementById('toggleChoropleth');
      if (choroplethCheckbox) {
        choroplethEnabled = choroplethCheckbox.checked;
      }
      applyChoroplethStyle();

      if (selectedProperty) {
        highlightProperty(selectedProperty.id);
        showMarker(selectedProperty);
      }
      map.jumpTo({ center, zoom, bearing, pitch });
    };

    // IMPORTANT: register listener BEFORE setStyle so we don't miss a
    // synchronous style.load emitted while swapping an inline object style.
    // Also safety-net with a styledata handler + isStyleLoaded poll because
    // MapLibre occasionally swallows `style.load` when rapidly swapping
    // URL-based and inline styles.
    let reinstated = false;
    const runOnce = () => {
      if (reinstated) return;
      reinstated = true;
      reinstateLayers();
    };

    map.once('style.load', runOnce);

    const styleDataHandler = () => {
      if (!reinstated && map.isStyleLoaded()) {
        map.off('styledata', styleDataHandler);
        runOnce();
      }
    };
    map.on('styledata', styleDataHandler);

    // Fallback poll — guarantees layers come back even if the above events
    // never fire as expected.
    const pollStart = Date.now();
    const poll = () => {
      if (reinstated) return;
      if (map.isStyleLoaded()) {
        runOnce();
        return;
      }
      if (Date.now() - pollStart < 4000) {
        setTimeout(poll, 80);
      }
    };
    setTimeout(poll, 80);

    // `diff: false` forces MapLibre to completely reset the style rather than
    // attempting a minimal diff — otherwise our custom source/layers can be
    // left in an inconsistent "half-migrated" state.
    map.setStyle(styleToApply, { diff: false });
  };

  const hidePlaceholder = () => {
    mapContainer?.querySelector('.map-placeholder')?.classList.add('hidden');
  };

  /**
   * Toggle grid layer visibility (placeholder for future grid layer)
   * @param {boolean} visible - Visibility state
   */
  const toggleGridLayer = (visible) => {
    if (!map) return;
    // Implement grid layer when available
    console.log('Grid layer toggle:', visible);
  };

  // Public API
  return {
    init,
    loadPropertyData,
    updateWithFilteredData,
    highlightProperty,
    flyToProperty,
    getMap,
    getBounds,
    fitToBounds,
    toggleParcelLayer,
    toggleChoropleth,
    setBasemap,
    showMarker,
    clearSelection,
  };
})();
