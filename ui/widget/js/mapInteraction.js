/**
 * Map Interaction Module for Property Owner Widget
 * Handles Maplibre GL JS map initialization and property location display
 */

const MapInteraction = (() => {
  let mapContainer = null;
  let map = null;
  let highlightedPropertyId = '';
  const VECTOR_TILE_URL =
    'https://storage.googleapis.com/musa5090s26-team2-public/tiles/properties/{z}/{x}/{y}.pbf';
  const VECTOR_SOURCE_LAYER = 'property_tile_info';
  const MARKET_TILE_URL =
    'https://storage.googleapis.com/musa5090s26-team2-public/tiles/residential_market/{z}/{x}/{y}.pbf';
  const MARKET_SOURCE_LAYER = 'residential_market_value';
  const METADATA_URL =
    'https://storage.googleapis.com/musa5090s26-team2-public/configs/map_style_metadata.json';
  const NEARBY_SOURCE_ID = 'owner-nearby-ring';

  /**
   * Initialize map with Maplibre GL JS
   * @param {object} options - Map configuration options
   */
  const init = (options = {}) => {
    mapContainer = document.getElementById('map');
    if (!mapContainer || typeof maplibregl === 'undefined') {
      console.warn('Map container not found or Maplibre GL JS not loaded');
      return;
    }

    // Default map options
    const defaultOptions = {
      container: mapContainer,
      style: options.style || 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: options.center || [-75.1652, 39.9526], // Philadelphia center
      zoom: options.zoom || 14,
      pitch: 0,
      bearing: 0,
    };

    try {
      map = new maplibregl.Map(defaultOptions);

      // Add map controls
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

      // When map loads, setup layers and events
      map.on('load', () => {
        console.log('✓ Map loaded successfully');
        hidePlaceholder();
        loadStyleMetadata();
        setupMapLayers();
        resize();
      });

      map.on('error', (e) => {
        console.error('Map error:', e);
      });
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  };

  /**
   * Setup map layers
   */
  const setupMapLayers = () => {
    if (!map) return;

    if (!map.getSource(NEARBY_SOURCE_ID)) {
      map.addSource(NEARBY_SOURCE_ID, {
        type: 'geojson',
        data: emptyFeatureCollection(),
      });

      map.addLayer({
        id: 'owner-nearby-ring-fill',
        type: 'fill',
        source: NEARBY_SOURCE_ID,
        paint: {
          'fill-color': '#a0caff',
          'fill-opacity': 0.12,
        },
      });

      map.addLayer({
        id: 'owner-nearby-ring-outline',
        type: 'line',
        source: NEARBY_SOURCE_ID,
        paint: {
          'line-color': '#a0caff',
          'line-width': 1.5,
          'line-opacity': 0.75,
        },
      });
    }

    if (!map.getSource('residential-market-parcels')) {
      map.addSource('residential-market-parcels', {
        type: 'vector',
        tiles: [MARKET_TILE_URL],
        minzoom: 12,
        maxzoom: 18,
      });

      map.addLayer({
        id: 'residential-market-fill',
        type: 'fill',
        source: 'residential-market-parcels',
        'source-layer': MARKET_SOURCE_LAYER,
        paint: {
          'fill-color': '#b7c0c8',
          'fill-opacity': 0.01,
        },
      });

      map.addLayer({
        id: 'residential-market-outline',
        type: 'line',
        source: 'residential-market-parcels',
        'source-layer': MARKET_SOURCE_LAYER,
        paint: {
          'line-color': '#626b73',
          'line-width': 0.35,
          'line-opacity': 0.45,
        },
      });

      map.addLayer({
        id: 'residential-market-highlight-fill',
        type: 'fill',
        source: 'residential-market-parcels',
        'source-layer': MARKET_SOURCE_LAYER,
        paint: {
          'fill-color': '#000000',
          'fill-opacity': 0.28,
        },
        filter: ['==', ['to-string', ['get', 'property_id']], ''],
      });

      map.addLayer({
        id: 'residential-market-highlight-outline',
        type: 'line',
        source: 'residential-market-parcels',
        'source-layer': MARKET_SOURCE_LAYER,
        paint: {
          'line-color': '#000000',
          'line-width': 3,
          'line-opacity': 0.95,
        },
        filter: ['==', ['to-string', ['get', 'property_id']], ''],
      });
    }

    // Add property parcels as Mapbox Vector Tiles (PBF) from GCS.
    if (!map.getSource('property-parcels')) {
      map.addSource('property-parcels', {
        type: 'vector',
        tiles: [VECTOR_TILE_URL],
        minzoom: 12,
        maxzoom: 18,
      });

      // Add parcel fill layer
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
            0,
            '#2b83ba',
            150000,
            '#00a6ca',
            250000,
            '#00ccbc',
            375000,
            '#90eb9d',
            500000,
            '#ffff8c',
            750000,
            '#f9d057',
            1000000,
            '#f29e2e',
            2000000,
            '#d7191c',
          ],
          'fill-opacity': 0.72,
        },
      });

      // Add parcel outline layer
      map.addLayer({
        id: 'property-parcels-outline',
        type: 'line',
        source: 'property-parcels',
        'source-layer': VECTOR_SOURCE_LAYER,
        paint: {
          'line-color': '#101414',
          'line-width': 0.45,
          'line-opacity': 0.55,
        },
      });

      map.addLayer({
        id: 'property-parcels-highlight-fill',
        type: 'fill',
        source: 'property-parcels',
        'source-layer': VECTOR_SOURCE_LAYER,
        paint: {
          'fill-color': '#000000',
          'fill-opacity': 0.28,
        },
        filter: ['==', ['to-string', ['get', 'property_id']], ''],
      });

      map.addLayer({
        id: 'property-parcels-highlight-outline',
        type: 'line',
        source: 'property-parcels',
        'source-layer': VECTOR_SOURCE_LAYER,
        paint: {
          'line-color': '#000000',
          'line-width': 3,
          'line-opacity': 0.95,
        },
        filter: ['==', ['to-string', ['get', 'property_id']], ''],
      });

      if (highlightedPropertyId) {
        highlightProperty(highlightedPropertyId);
      }

      const getSearchPropertyById = (propertyId) => {
        if (
          typeof Search !== 'undefined' &&
          typeof Search.getPropertyById === 'function'
        ) {
          return Search.getPropertyById(String(propertyId));
        }
        return null;
      };

      const enrichSaleFields = (property) => {
        if (!property?.id || typeof Search === 'undefined') return property;
        const sale = Search.getSaleById?.(property.id);
        if (!sale) return property;
        return {
          ...property,
          sale_price: Number.isFinite(property.sale_price) && property.sale_price > 0
            ? property.sale_price
            : sale.sale_price,
          sale_date: property.sale_date || sale.sale_date,
        };
      };

      const refreshSaleFieldsWhenReady = (property) => {
        if (!property?.id || typeof Search === 'undefined' || typeof Search.getSaleByIdAsync !== 'function') {
          return;
        }
        Search.getSaleByIdAsync(property.id).then((sale) => {
          if (!sale || highlightedPropertyId !== String(property.id)) return;
          PropertyDisplay.displayProperty({
            ...property,
            sale_price: Number.isFinite(property.sale_price) && property.sale_price > 0
              ? property.sale_price
              : sale.sale_price,
            sale_date: property.sale_date || sale.sale_date,
          });
        });
      };

      const openPropertyFromFeature = (feature, lngLat = null) => {
        const props = feature.properties;
        if (typeof PropertyDisplay === 'undefined') return;

        const propertyId = String(props.property_id || '');
        const searchProperty = getSearchPropertyById(propertyId);
        if (searchProperty) {
          const enrichedProperty = {
            ...searchProperty,
            lat: lngLat?.lat ?? searchProperty.lat ?? null,
            lng: lngLat?.lng ?? searchProperty.lng ?? null,
          };

          highlightProperty(enrichedProperty.id);
          const center =
            Number.isFinite(enrichedProperty.lng) &&
            Number.isFinite(enrichedProperty.lat)
              ? [enrichedProperty.lng, enrichedProperty.lat]
              : lngLat
                ? [lngLat.lng, lngLat.lat]
                : getFeatureCenter(feature);
          if (center) {
            map.flyTo({
              center,
              zoom: 17,
              duration: 1000,
            });
          }
          PropertyDisplay.displayProperty(enrichSaleFields(enrichedProperty));
          refreshSaleFieldsWhenReady(enrichedProperty);
          return;
        }

        const predictedValue = Number(props.predicted_value);
        const marketValue = Number(props.market_value);
        const salePrice = Number(props.sale_price);
        const lastYearValue = Number.isFinite(marketValue)
          ? marketValue
          : props.log_price
            ? Math.exp(Number(props.log_price))
            : Number.isFinite(predictedValue)
              ? predictedValue
              : null;
        const propertyData = {
          id: propertyId,
          address: props.address || `Property ${propertyId}`,
          lat: lngLat?.lat ?? null,
          lng: lngLat?.lng ?? null,
          last_year_value: lastYearValue,
          tax_year_value: lastYearValue,
          market_value: lastYearValue,
          predicted_value: Number.isFinite(predictedValue) ? predictedValue : null,
          property_type: props.bldg_desc || 'Residential',
          lot_size: Number(props.gross_area || 0),
          sale_date: props.sale_date || null,
          sale_price: Number.isFinite(salePrice) ? salePrice : null,
          year_built: null,
          tax_status: 'Current',
          neighborhood: null,
        };
        propertyData.change_percent =
          Number.isFinite(propertyData.predicted_value) && Number.isFinite(propertyData.last_year_value) && propertyData.last_year_value > 0
            ? ((propertyData.predicted_value - propertyData.last_year_value) / propertyData.last_year_value) * 100
            : null;
        highlightProperty(propertyData.id);
        const center =
          Number.isFinite(propertyData.lng) && Number.isFinite(propertyData.lat)
            ? [propertyData.lng, propertyData.lat]
            : lngLat
              ? [lngLat.lng, lngLat.lat]
              : getFeatureCenter(feature);
        if (center) {
          map.flyTo({
            center,
            zoom: 17,
            duration: 1000,
          });
        }
        PropertyDisplay.displayProperty(enrichSaleFields(propertyData));
        refreshSaleFieldsWhenReady(propertyData);

        if (typeof Search !== 'undefined' && typeof Search.onReady === 'function') {
          Search.onReady(() => {
            if (highlightedPropertyId !== propertyId) return;
            const refreshedProperty = getSearchPropertyById(propertyId);
            if (!refreshedProperty) return;

            const refreshed = {
              ...refreshedProperty,
              lat: Number.isFinite(refreshedProperty.lat)
                ? refreshedProperty.lat
                : propertyData.lat,
              lng: Number.isFinite(refreshedProperty.lng)
                ? refreshedProperty.lng
                : propertyData.lng,
            };
            PropertyDisplay.displayProperty(enrichSaleFields(refreshed));
            refreshSaleFieldsWhenReady(refreshed);
          });
        }
      };

      map.on('click', 'property-parcels-fill', (e) => {
        if (e.features.length > 0) {
          openPropertyFromFeature(e.features[0], e.lngLat);
        }
      });

      map.on('click', 'residential-market-fill', (e) => {
        if (e.features.length > 0) {
          openPropertyFromFeature(e.features[0], e.lngLat);
        }
      });

      // Change cursor on hover
      map.on('mouseenter', 'property-parcels-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'property-parcels-fill', () => {
        map.getCanvas().style.cursor = '';
      });
      map.on('mouseenter', 'residential-market-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'residential-market-fill', () => {
        map.getCanvas().style.cursor = '';
      });

      map.on('click', (e) => {
        const parcelHits = map.queryRenderedFeatures(e.point, {
          layers: ['property-parcels-fill', 'residential-market-fill'],
        });
        if (parcelHits.length > 0) return;

        const nearestFeature = findNearestParcelFeature(e.point);
        if (nearestFeature) {
          openPropertyFromFeature(nearestFeature, e.lngLat);
        }
      });
    }

    // Add a source for property points (for search/single property display)
    if (!map.getSource('properties')) {
      map.addSource('properties', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      // Add layer for property points
      map.addLayer({
        id: 'properties-layer',
        type: 'circle',
        source: 'properties',
        paint: {
          'circle-radius': 9,
          'circle-color': '#a0caff',
          'circle-opacity': 0.9,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Add click event
      map.on('click', 'properties-layer', (e) => {
        if (e.features.length > 0) {
          const feature = e.features[0];
          if (typeof PropertyDisplay !== 'undefined') {
            PropertyDisplay.displayProperty(feature.properties);
          }
        }
      });

      // Change cursor on hover
      map.on('mouseenter', 'properties-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'properties-layer', () => {
        map.getCanvas().style.cursor = '';
      });
    }

    console.log('✓ Map layers setup');
  };

  /**
   * Load property data on map
   * @param {array} properties - Array of property objects
   */
  const loadPropertyData = (properties) => {
    if (!map || !map.isStyleLoaded()) {
      setTimeout(() => loadPropertyData(properties), 500);
      return;
    }

    resize();

    const source = map.getSource('properties');
    if (!source) {
      console.warn('Properties source not found');
      return;
    }

    const validProperties = properties.filter(
      (prop) => Number.isFinite(prop.lng) && Number.isFinite(prop.lat)
    );

    const features = validProperties.map((prop) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [prop.lng, prop.lat],
      },
      properties: prop,
    }));

    source.setData({
      type: 'FeatureCollection',
      features,
    });

    console.log(`✓ Loaded ${features.length} properties on map`);

    // Fit bounds if multiple properties
    if (validProperties.length > 1) {
      fitToBounds(validProperties);
    } else if (validProperties.length === 1) {
      highlightProperty(validProperties[0].id);
      map.flyTo({
        center: [validProperties[0].lng, validProperties[0].lat],
        zoom: 17,
        duration: 1000,
      });
    }
  };

  /**
   * Fit map to bounds of properties
   * @param {array} properties - Array of properties
   */
  const fitToBounds = (properties) => {
    if (!map || properties.length === 0) return;

    const lngs = properties.map((p) => p.lng);
    const lats = properties.map((p) => p.lat);

    const bounds = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];

    map.fitBounds(bounds, { padding: 50, duration: 1000 });
  };

  /**
   * Highlight a property on the map
   * @param {string} propertyId - Property ID to highlight
   */
  const highlightProperty = (propertyId) => {
    if (!map) return;

    highlightedPropertyId = String(propertyId || '');
    const filter = ['==', ['to-string', ['get', 'property_id']], highlightedPropertyId];
    [
      'property-parcels-highlight-fill',
      'property-parcels-highlight-outline',
      'residential-market-highlight-fill',
      'residential-market-highlight-outline',
    ].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, filter);
      }
    });
  };

  /**
   * Clear map
   */
  const clear = () => {
    if (!map) return;

    const source = map.getSource('properties');
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
    clearHighlight();
    clearNearbyRing();
  };

  const clearHighlight = () => {
    highlightedPropertyId = '';
    const filter = ['==', ['to-string', ['get', 'property_id']], ''];
    [
      'property-parcels-highlight-fill',
      'property-parcels-highlight-outline',
      'residential-market-highlight-fill',
      'residential-market-highlight-outline',
    ].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, filter);
      }
    });
  };

  const findNearestParcelFeature = (point) => {
    if (!map || !point) return null;

    const layers = ['property-parcels-fill', 'residential-market-fill'];
    const radii = [8, 16, 32, 64, 128];

    for (const radius of radii) {
      const features = map.queryRenderedFeatures(
        [
          [point.x - radius, point.y - radius],
          [point.x + radius, point.y + radius],
        ],
        { layers }
      );

      if (!features.length) continue;

      const ranked = features
        .map((feature) => ({
          feature,
          distance: distanceToFeatureCenter(point, feature),
        }))
        .sort((a, b) => a.distance - b.distance);

      return ranked[0]?.feature || null;
    }

    return null;
  };

  const distanceToFeatureCenter = (point, feature) => {
    const center = getFeatureCenter(feature);
    if (!center) return Number.POSITIVE_INFINITY;
    const projected = map.project(center);
    const dx = projected.x - point.x;
    const dy = projected.y - point.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getFeatureCenter = (feature) => {
    const geometry = feature?.geometry;
    if (!geometry?.coordinates) return null;

    if (geometry.type === 'Point') {
      return geometry.coordinates;
    }

    const ring =
      geometry.type === 'Polygon'
        ? geometry.coordinates[0]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates[0]?.[0]
          : null;

    if (!ring?.length) return null;

    const totals = ring.reduce(
      (acc, coord) => {
        acc.lng += Number(coord[0] || 0);
        acc.lat += Number(coord[1] || 0);
        return acc;
      },
      { lng: 0, lat: 0 }
    );

    return [totals.lng / ring.length, totals.lat / ring.length];
  };

  const resize = () => {
    if (!map) return;

    try {
      map.resize();
      hidePlaceholder();
    } catch (error) {
      console.warn('Unable to resize map:', error);
    }
  };

  const hidePlaceholder = () => {
    const placeholder = mapContainer?.querySelector('.map-placeholder');
    if (placeholder) {
      placeholder.classList.add('hidden');
    }
  };

  const loadStyleMetadata = async () => {
    try {
      const response = await fetch(METADATA_URL);
      if (!response.ok) throw new Error(`Metadata ${response.status}`);
      const metadata = await response.json();
      const field = metadata?.fields?.predicted_value;
      if (field) updateLegendLabels(field);
    } catch (error) {
      console.warn('Unable to load owner legend metadata:', error);
      updateLegendLabels({
        display_min: 0,
        display_max: 1000000,
        breakpoints: [0, 250000, 500000, 1000000],
      });
    }
  };

  const updateLegendLabels = (field) => {
    const labels = document.getElementById('ownerLegendLabels');
    if (!labels) return;

    const breakpoints = (field.breakpoints || [])
      .map(Number)
      .filter(Number.isFinite);
    const labelValues =
      breakpoints.length >= 4
        ? [
            field.display_min ?? breakpoints[0],
            breakpoints[Math.floor(breakpoints.length / 3)],
            breakpoints[Math.floor((breakpoints.length * 2) / 3)],
            field.display_max ?? breakpoints[breakpoints.length - 1],
          ]
        : [
            field.display_min ?? field.min ?? 0,
            field.display_max ?? field.max ?? 1000000,
          ];

    labels.innerHTML = labelValues
      .map((value) => `<span>${formatCompactCurrency(Number(value))}</span>`)
      .join('');
  };

  const formatCompactCurrency = (value) => {
    if (!Number.isFinite(value)) return '-';
    if (Math.abs(value) >= 1000000) {
      const amount = value / 1000000;
      return `$${amount.toFixed(amount >= 10 || Number.isInteger(amount) ? 0 : 1)}M`;
    }
    if (Math.abs(value) >= 1000) return `$${Math.round(value / 1000)}k`;
    return `$${Math.round(value)}`;
  };

  const showNearbyRing = (lng, lat, radiusMeters = 250) => {
    if (!map || !map.getSource(NEARBY_SOURCE_ID)) return;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      clearNearbyRing();
      return;
    }

    map.getSource(NEARBY_SOURCE_ID).setData({
      type: 'FeatureCollection',
      features: [createCircleFeature(lng, lat, radiusMeters)],
    });
  };

  const clearNearbyRing = () => {
    if (!map || !map.getSource(NEARBY_SOURCE_ID)) return;
    map.getSource(NEARBY_SOURCE_ID).setData(emptyFeatureCollection());
  };

  const createCircleFeature = (lng, lat, radiusMeters, steps = 72) => {
    const coordinates = [];
    const earthRadius = 6371000;
    const angularDistance = radiusMeters / earthRadius;
    const latRad = (lat * Math.PI) / 180;
    const lngRad = (lng * Math.PI) / 180;

    for (let step = 0; step <= steps; step += 1) {
      const bearing = (2 * Math.PI * step) / steps;
      const pointLat = Math.asin(
        Math.sin(latRad) * Math.cos(angularDistance) +
          Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
      );
      const pointLng =
        lngRad +
        Math.atan2(
          Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
          Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(pointLat)
        );
      coordinates.push([
        ((pointLng * 180) / Math.PI + 540) % 360 - 180,
        (pointLat * 180) / Math.PI,
      ]);
    }

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [coordinates],
      },
      properties: {
        radius_m: radiusMeters,
      },
    };
  };

  const emptyFeatureCollection = () => ({
    type: 'FeatureCollection',
    features: [],
  });

  /**
   * Toggle parcel vector layer visibility
   * @param {boolean} visible - Visibility state
   */
  const toggleParcelLayer = (visible) => {
    if (!map) return;

    [
      'residential-market-fill',
      'residential-market-outline',
      'residential-market-highlight-fill',
      'residential-market-highlight-outline',
      'property-parcels-fill',
      'property-parcels-outline',
      'property-parcels-highlight-fill',
      'property-parcels-highlight-outline',
    ].forEach((layerId) => {
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

  /**
   * Get map instance
   * @returns {object} Maplibre GL map instance
   */
  const getMap = () => {
    return map;
  };

  // Public API
  return {
    init,
    loadPropertyData,
    fitToBounds,
    highlightProperty,
    clear,
    toggleParcelLayer,
    resize,
    getMap,
    showNearbyRing,
    clearNearbyRing,
  };
})();
