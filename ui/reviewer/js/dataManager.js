/**
 * Data Manager for Tax Assessor Review Interface
 * Handles data filtering, sorting, searching, and statistics calculation
 */

const DataManager = (() => {
  const SEARCH_INDEX_URL =
    'https://storage.googleapis.com/musa5090s26-team2-public/configs/property_search_index.json?v=20260429-full-search';
  const SALE_INDEX_URL =
    'https://storage.googleapis.com/musa5090s26-team2-public/configs/property_sale_index.json?v=20260429';

  let allProperties = [];
  let filteredProperties = [];
  let saleIndex = new Map();
  let saleIndexPromise = null;
  let filterExtents = {
    predictedMin: 0,
    predictedMax: 5000000,
    marketMin: 0,
    marketMax: 5000000,
    changeMin: -50,
    changeMax: 50,
  };
  let currentFilters = {
    priceMin: 0,
    priceMax: 5000000,
    changeMin: -50,
    changeMax: 50,
    marketMin: null,
    marketMax: null,
    searchTerm: '',
  };

  const classifyPropertyType = (bldgDesc) => {
    if (!bldgDesc) return 'residential';
    const desc = bldgDesc.toUpperCase();
    if (/INDUS|FACTORY|WAREHOUSE|MFG/.test(desc)) return 'industrial';
    if (/COMM|OFF|STORE|RETAIL|SHOP|HOTEL|REST/.test(desc)) return 'commercial';
    return 'residential';
  };

  const polygonCentroid = (coords) => {
    const ring = coords[0];
    let x = 0;
    let y = 0;
    ring.forEach(([lng, lat]) => {
      x += lng;
      y += lat;
    });
    return [x / ring.length, y / ring.length];
  };

  const getGeometryCenter = (feature) => {
    let lng = null;
    let lat = null;
    if (feature.geometry && feature.geometry.coordinates) {
      if (feature.geometry.type === 'Polygon') {
        [lng, lat] = polygonCentroid(feature.geometry.coordinates);
      } else if (feature.geometry.type === 'Point') {
        [lng, lat] = feature.geometry.coordinates;
      } else if (feature.geometry.type === 'MultiPolygon') {
        const firstPolygon = feature.geometry.coordinates?.[0];
        if (firstPolygon) {
          [lng, lat] = polygonCentroid(firstPolygon);
        }
      }
    }
    return [lng, lat];
  };

  const transformMlFeature = (feature) => {
    const p = feature.properties || {};
    const [lng, lat] = getGeometryCenter(feature);

    const lastYearValue = p.log_price ? Math.exp(p.log_price) : null;
    const predicted = Number(p.predicted_value || 0) || 0;
    const changePercent =
      lastYearValue && lastYearValue > 0
        ? ((predicted - lastYearValue) / lastYearValue) * 100
        : 0;

    return {
      id: String(p.property_id || ''),
      address: p.address || p.location || 'Address not available',
      property_type: classifyPropertyType(p.bldg_desc),
      bldg_desc: p.bldg_desc || 'Unknown',
      lat,
      lng,
      tax_year_value: lastYearValue || predicted,
      last_year_value: lastYearValue,
      predicted_value: predicted,
      market_value: lastYearValue || predicted,
      sale_price: Number(p.sale_price || 0) || null,
      sale_year: Number(p.sale_year || 0) || null,
      change_percent: changePercent,
      lot_size: p.gross_area || 0,
      zip_code: p.zip_code || null,
      neighborhood: p.zip_code || null,
      sale_date: p.sale_date || null,
      sale_price: Number(p.sale_price || 0) || null,
      has_prediction: true,
    };
  };

  const transformFullFeature = (feature) => {
    const p = feature.properties || {};
    const [lng, lat] = getGeometryCenter(feature);
    const marketValue = Number(p.market_value || 0) || null;

    return {
      id: String(p.property_id || ''),
      address: p.location || p.address || 'Address not available',
      property_type: 'residential',
      bldg_desc: 'Residential',
      lat,
      lng,
      tax_year_value: marketValue,
      last_year_value: marketValue,
      predicted_value: null,
      market_value: marketValue,
      sale_price: Number(p.sale_price || 0) || null,
      sale_date: p.sale_date || null,
      sale_year: p.sale_date ? Number(String(p.sale_date).slice(0, 4)) || null : null,
      change_percent: null,
      lot_size: 0,
      zip_code: null,
      neighborhood: null,
      has_prediction: false,
    };
  };

  const mergePropertyRecords = (fullProperty, mlProperty) => {
    if (!mlProperty) return fullProperty;

    return {
      ...fullProperty,
      ...mlProperty,
      address: fullProperty.address || mlProperty.address,
      market_value: Number.isFinite(fullProperty.market_value)
        ? fullProperty.market_value
        : mlProperty.market_value,
      last_year_value: Number.isFinite(fullProperty.market_value)
        ? fullProperty.market_value
        : mlProperty.last_year_value,
      tax_year_value: Number.isFinite(fullProperty.market_value)
        ? fullProperty.market_value
        : mlProperty.tax_year_value,
      sale_price: Number.isFinite(fullProperty.sale_price) ? fullProperty.sale_price : null,
      sale_date: fullProperty.sale_date || null,
      has_prediction: Number.isFinite(mlProperty.predicted_value),
      change_percent:
        Number.isFinite(fullProperty.market_value) &&
        Number.isFinite(mlProperty.predicted_value) &&
        fullProperty.market_value > 0
          ? ((mlProperty.predicted_value - fullProperty.market_value) /
              fullProperty.market_value) *
            100
          : mlProperty.change_percent,
    };
  };

  const transformSearchRecord = (record) => {
    const rawPredicted = toFiniteNumber(record.predicted_value);
    const predicted = Number.isFinite(rawPredicted) && rawPredicted > 0 ? rawPredicted : null;
    const market = toFiniteNumber(record.market_value ?? record.last_year_value);
    const changePercent = Number.isFinite(predicted) ? toFiniteNumber(record.change_percent) : null;

    return {
      id: String(record.id || record.property_id || ''),
      address: record.address || record.location || 'Address not available',
      property_type: classifyPropertyType(record.bldg_desc || record.property_type),
      bldg_desc: record.bldg_desc || record.property_type || 'Unknown',
      lat: toFiniteNumber(record.lat),
      lng: toFiniteNumber(record.lng),
      tax_year_value: market ?? predicted,
      last_year_value: market,
      predicted_value: predicted,
      market_value: market ?? predicted,
      sale_price: toFiniteNumber(record.sale_price),
      sale_year: toFiniteNumber(record.sale_year),
      sale_month: toFiniteNumber(record.sale_month),
      change_percent:
        changePercent ??
        (market && predicted ? ((predicted - market) / market) * 100 : null),
      lot_size: toFiniteNumber(record.lot_size),
      zip_code: record.zip_code || null,
      neighborhood: record.neighborhood || record.zip_code || null,
      sale_date: record.sale_date || null,
      has_prediction: Number.isFinite(predicted),
    };
  };

  /**
   * Initialize data manager with property data
   * @param {array} properties - Array of property objects
   */
  const init = (properties) => {
    allProperties = properties;
    deriveExtents();
    currentFilters = {
      ...currentFilters,
      priceMin: filterExtents.predictedMin,
      priceMax: filterExtents.predictedMax,
      changeMin: filterExtents.changeMin,
      changeMax: filterExtents.changeMax,
    };
    applyFilters();
  };

  /**
   * Load property data from the public GeoJSON on GCS
   * @returns {Promise<array>} Transformed property objects
   */
  const loadGeoJSON = async () => {
    try {
      const response = await fetch(SEARCH_INDEX_URL);
      if (!response.ok) {
        throw new Error(`Failed to load property search index: ${response.status}`);
      }
      const records = normalizeSearchRecords(await response.json());
      const properties = records
        .map(transformSearchRecord)
        .filter((property) => property.id && property.address);
      init(properties);
      loadSaleIndex();
      return properties;
    } catch (error) {
      console.error('Error loading property search index:', error);
      return [];
    }
  };

  const normalizeSearchRecords = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (!payload?.columns || !payload?.rows) return [];

    return payload.rows.map((row) =>
      payload.columns.reduce((record, column, index) => {
        record[column] = row[index];
        return record;
      }, {})
    );
  };

  const loadSaleIndex = () => {
    if (saleIndexPromise) return saleIndexPromise;
    saleIndexPromise = fetch(SALE_INDEX_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load sale index: ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const rows = normalizeSearchRecords(payload);
        saleIndex = new Map(
          rows
            .filter((record) => record.id)
            .map((record) => [
              String(record.id),
              {
                sale_price: toFiniteNumber(record.sale_price),
                sale_date: record.sale_date || null,
              },
            ])
        );
        allProperties = allProperties.map(enrichWithSale);
        applyFilters();
        return saleIndex;
      })
      .catch((error) => {
        console.warn('Sale index unavailable:', error);
        saleIndex = new Map();
        return saleIndex;
      });
    return saleIndexPromise;
  };

  const getSaleById = (id) => saleIndex.get(String(id)) || null;

  const getSaleByIdAsync = async (id) => {
    await loadSaleIndex();
    return getSaleById(id);
  };

  const enrichWithSale = (property) => {
    if (!property?.id) return property;
    const sale = getSaleById(property.id);
    if (!sale) return property;
    return {
      ...property,
      sale_price: Number.isFinite(property.sale_price) && property.sale_price > 0
        ? property.sale_price
        : sale.sale_price,
      sale_date: property.sale_date || sale.sale_date,
    };
  };

  /**
   * Backwards-compatible loader — ignores path and loads the GeoJSON.
   * @returns {Promise<array>}
   */
  const loadData = async () => loadGeoJSON();

  /**
   * Update filter criteria
   * @param {object} filters - New filter values
   */
  const setFilters = (filters) => {
    currentFilters = { ...currentFilters, ...filters };
    applyFilters();
  };

  /**
   * Apply all active filters to data
   */
  const applyFilters = () => {
    filteredProperties = allProperties.filter((property) => {
      // Price range filter
      if (
        property.predicted_value < currentFilters.priceMin ||
        property.predicted_value > currentFilters.priceMax
      ) {
        return false;
      }

      // Change percentage filter
      if (
        property.change_percent < currentFilters.changeMin ||
        property.change_percent > currentFilters.changeMax
      ) {
        return false;
      }

      if (
        Number.isFinite(currentFilters.marketMin) &&
        property.market_value < currentFilters.marketMin
      ) {
        return false;
      }

      if (
        Number.isFinite(currentFilters.marketMax) &&
        property.market_value > currentFilters.marketMax
      ) {
        return false;
      }

      // Search term filter
      if (currentFilters.searchTerm) {
        const term = normalizeSearchText(currentFilters.searchTerm);
        const matches =
          normalizeSearchText(property.address).includes(term) ||
          String(property.id).includes(currentFilters.searchTerm);
        if (!matches) return false;
      }

      return true;
    });
  };

  /**
   * Get all filtered properties
   * @returns {array} Filtered properties array
   */
  const getFilteredProperties = () => {
    return filteredProperties;
  };

  const getAllProperties = () => {
    return allProperties;
  };

  /**
   * Get single property by ID
   * @param {string} id - Property ID
   * @returns {object} Property object or null
   */
  const getPropertyById = (id) => {
    return allProperties.find((p) => String(p.id) === String(id)) || null;
  };

  /**
   * Search properties by address or ID
   * @param {string} term - Search term
   * @returns {array} Matching properties
   */
  const search = (term) => {
    setFilters({ searchTerm: term });
    return filteredProperties;
  };

  const searchCandidates = (term, limit = 8) => {
    const normalizedTerm = normalizeSearchText(term);
    if (!normalizedTerm) return [];

    const scored = allProperties
      .map((property) => {
        const address = normalizeSearchText(property.address);
        const id = String(property.id);
        let score = stringDistance(normalizedTerm, address);

        if (address.includes(normalizedTerm)) score -= 1000;
        if (id.includes(term)) score -= 1200;
        if (address.startsWith(normalizedTerm)) score -= 500;

        return { property, score };
      })
      .sort((a, b) => a.score - b.score);

    return scored.slice(0, limit).map((item) => item.property);
  };

  /**
   * Sort filtered properties
   * @param {string} property - Property to sort by
   * @param {string} order - 'asc' or 'desc'
   * @returns {array} Sorted properties
   */
  const sort = (property, order = 'asc') => {
    filteredProperties = Utils.sortBy(filteredProperties, property, order);
    return filteredProperties;
  };

  /**
   * Get statistics for all properties
   * @returns {object} Statistics object
   */
  const getStatistics = () => {
    const values = filteredProperties.map((p) => p.tax_year_value);
    const changes = filteredProperties.map((p) => p.change_percent);

    return {
      totalCount: filteredProperties.length,
      increasedCount: filteredProperties.filter((p) => p.change_percent > 0)
        .length,
      decreasedCount: filteredProperties.filter((p) => p.change_percent < 0)
        .length,
      unchangedCount: filteredProperties.filter((p) => p.change_percent === 0)
        .length,
      valueStats: Utils.calculateStats(values),
      changeStats: Utils.calculateStats(changes),
    };
  };

  /**
   * Get statistics by neighborhood/zip code
   * @param {string} neighborhood - Neighborhood identifier
   * @returns {object} Neighborhood statistics
   */
  const getNeighborhoodStats = (neighborhood) => {
    const neighborhoodProps = filteredProperties.filter(
      (p) => p.neighborhood === neighborhood
    );
    return {
      count: neighborhoodProps.length,
      avgValue:
        neighborhoodProps.reduce((sum, p) => sum + p.tax_year_value, 0) /
        neighborhoodProps.length,
      avgChange:
        neighborhoodProps.reduce((sum, p) => sum + p.change_percent, 0) /
        neighborhoodProps.length,
    };
  };

  /**
   * Get distribution data for charts
   * @param {string} type - 'price' or 'change'
   * @param {number} bins - Number of bins for distribution
   * @returns {array} Distribution data
   */
  const getDistributionData = (type = 'price', bins = 10) => {
    const data =
      type === 'price'
        ? filteredProperties.map((p) => p.tax_year_value)
        : filteredProperties.map((p) => p.change_percent);

    if (data.length === 0) return [];

    const stats = Utils.calculateStats(data);
    const range = stats.max - stats.min;
    const binSize = range / bins;

    const distribution = Array(bins).fill(0);

    data.forEach((value) => {
      const binIndex = Math.min(
        Math.floor((value - stats.min) / binSize),
        bins - 1
      );
      distribution[binIndex]++;
    });

    return distribution.map((count, index) => {
      const binStart = stats.min + index * binSize;
      const binEnd = binStart + binSize;
      return {
        range: `${Utils.formatCurrency(binStart)}-${Utils.formatCurrency(binEnd)}`,
        count,
        percentage: ((count / data.length) * 100).toFixed(1),
      };
    });
  };

  /**
   * Export filtered data as CSV
   * @returns {string} CSV formatted string
   */
  const exportCSV = () => {
    const headers = [
      'ID',
      'Address',
      'Tax Year Value',
      'Predicted Value',
      'Change %',
      'Property Type',
      'Last Inspection',
    ];
    const rows = filteredProperties.map((p) => [
      p.id,
      p.address,
      p.tax_year_value,
      p.predicted_value,
      p.change_percent,
      p.property_type,
      p.last_inspection,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    return csv;
  };

  /**
   * Download CSV file
   */
  const downloadCSV = () => {
    const csv = exportCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assessment-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  /**
   * Reset all filters
   */
  const resetFilters = () => {
    currentFilters = {
      priceMin: filterExtents.predictedMin,
      priceMax: filterExtents.predictedMax,
      changeMin: filterExtents.changeMin,
      changeMax: filterExtents.changeMax,
      marketMin: null,
      marketMax: null,
      searchTerm: '',
    };
    applyFilters();
  };

  const clearRangeDrilldown = () => {
    currentFilters = {
      ...currentFilters,
      marketMin: null,
      marketMax: null,
    };
    applyFilters();
  };

  const setChartRangeFilter = (field, min, max) => {
    if (field === 'predicted') {
      currentFilters = {
        ...currentFilters,
        priceMin: min,
        priceMax: max,
        marketMin: null,
        marketMax: null,
      };
    } else if (field === 'market') {
      currentFilters = {
        ...currentFilters,
        marketMin: min,
        marketMax: max,
      };
    }
    applyFilters();
  };

  /**
   * Get current filters
   * @returns {object} Current filter values
   */
  const getFilters = () => {
    return Utils.deepClone(currentFilters);
  };

  /**
   * Get total count of all properties
   * @returns {number} Total property count
   */
  const getTotalCount = () => {
    return allProperties.length;
  };

  /**
   * Get filtered count
   * @returns {number} Filtered property count
   */
  const getFilteredCount = () => {
    return filteredProperties.length;
  };

  const getFilterExtents = () => Utils.deepClone(filterExtents);

  const deriveExtents = () => {
    const predictedRange = getNumericRange('predicted_value', (value) => value > 0);
    const marketRange = getNumericRange('market_value', (value) => value > 0);
    const changeRange = getNumericRange('change_percent');

    filterExtents = {
      predictedMin: predictedRange.count ? Math.floor(predictedRange.min) : 0,
      predictedMax: predictedRange.count ? Math.ceil(predictedRange.max) : 5000000,
      marketMin: marketRange.count ? Math.floor(marketRange.min) : 0,
      marketMax: marketRange.count ? Math.ceil(marketRange.max) : 5000000,
      changeMin: changeRange.count ? Math.floor(changeRange.min) : -50,
      changeMax: changeRange.count ? Math.ceil(changeRange.max) : 50,
    };
  };

  const getNumericRange = (field, predicate = () => true) => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let count = 0;

    allProperties.forEach((property) => {
      const value = Number(property[field]);
      if (!Number.isFinite(value) || !predicate(value)) return;
      min = Math.min(min, value);
      max = Math.max(max, value);
      count += 1;
    });

    return { min, max, count };
  };

  const toFiniteNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const normalizeSearchText = (value) => {
    return String(value || '')
      .toLowerCase()
      .replace(/[.,#]/g, ' ')
      .replace(/\bphiladelphia\b/g, ' ')
      .replace(/\bpennsylvania\b/g, ' ')
      .replace(/\bpa\b/g, ' ')
      .replace(/\bstreet\b/g, 'st')
      .replace(/\bavenue\b/g, 'ave')
      .replace(/\broad\b/g, 'rd')
      .replace(/\bboulevard\b/g, 'blvd')
      .replace(/\bplace\b/g, 'pl')
      .replace(/\bcourt\b/g, 'ct')
      .replace(/\blane\b/g, 'ln')
      .replace(/\bdrive\b/g, 'dr')
      .replace(/\bnorth\b/g, 'n')
      .replace(/\bsouth\b/g, 's')
      .replace(/\beast\b/g, 'e')
      .replace(/\bwest\b/g, 'w')
      .replace(/\b\d{5}(?:-\d{4})?\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const stringDistance = (a, b) => {
    if (!a) return 0;
    if (!b) return a.length;

    const shortB = b.slice(0, Math.max(a.length + 8, 24));
    const previous = Array.from({ length: shortB.length + 1 }, (_, i) => i);
    const current = Array(shortB.length + 1).fill(0);

    for (let i = 1; i <= a.length; i++) {
      current[0] = i;
      for (let j = 1; j <= shortB.length; j++) {
        const cost = a[i - 1] === shortB[j - 1] ? 0 : 1;
        current[j] = Math.min(
          previous[j] + 1,
          current[j - 1] + 1,
          previous[j - 1] + cost
        );
      }
      for (let j = 0; j <= shortB.length; j++) previous[j] = current[j];
    }

    return previous[shortB.length];
  };

  // Public API
  return {
    init,
    loadData,
    loadGeoJSON,
    loadSaleIndex,
    setFilters,
    getAllProperties,
    getFilteredProperties,
    getPropertyById,
    getSaleById,
    getSaleByIdAsync,
    enrichWithSale,
    search,
    searchCandidates,
    sort,
    getStatistics,
    getNeighborhoodStats,
    getDistributionData,
    exportCSV,
    downloadCSV,
    resetFilters,
    clearRangeDrilldown,
    setChartRangeFilter,
    getFilters,
    getFilterExtents,
    getTotalCount,
    getFilteredCount,
  };
})();
