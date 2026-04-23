/**
 * Data Manager for Tax Assessor Review Interface
 * Handles data filtering, sorting, searching, and statistics calculation
 */

const DataManager = (() => {
  const GEOJSON_URL =
    'https://storage.googleapis.com/musa5090s26-team2-temp_data/property_tile_info.geojson';

  let allProperties = [];
  let filteredProperties = [];
  let currentFilters = {
    priceMin: 0,
    priceMax: 5000000,
    changeMin: -50,
    changeMax: 50,
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

  const transformFeature = (feature) => {
    const p = feature.properties || {};
    let lng = null;
    let lat = null;
    if (feature.geometry && feature.geometry.coordinates) {
      if (feature.geometry.type === 'Polygon') {
        [lng, lat] = polygonCentroid(feature.geometry.coordinates);
      } else if (feature.geometry.type === 'Point') {
        [lng, lat] = feature.geometry.coordinates;
      }
    }

    const lastYearValue = p.log_price ? Math.exp(p.log_price) : null;
    const predicted = p.predicted_value || 0;
    const changePercent =
      lastYearValue && lastYearValue > 0
        ? ((predicted - lastYearValue) / lastYearValue) * 100
        : 0;

    return {
      id: String(p.property_id || ''),
      address: p.address || 'Address not available',
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
    };
  };

  /**
   * Initialize data manager with property data
   * @param {array} properties - Array of property objects
   */
  const init = (properties) => {
    allProperties = properties;
    applyFilters();
  };

  /**
   * Load property data from the public GeoJSON on GCS
   * @returns {Promise<array>} Transformed property objects
   */
  const loadGeoJSON = async () => {
    try {
      const response = await fetch(GEOJSON_URL);
      if (!response.ok) {
        throw new Error(`Failed to load GeoJSON: ${response.status}`);
      }
      const geo = await response.json();
      const properties = (geo.features || []).map(transformFeature);
      init(properties);
      return properties;
    } catch (error) {
      console.error('Error loading GeoJSON:', error);
      return [];
    }
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
        property.tax_year_value < currentFilters.priceMin ||
        property.tax_year_value > currentFilters.priceMax
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
      priceMin: 0,
      priceMax: 5000000,
      changeMin: -50,
      changeMax: 50,
      searchTerm: '',
    };
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
    setFilters,
    getFilteredProperties,
    getPropertyById,
    search,
    searchCandidates,
    sort,
    getStatistics,
    getNeighborhoodStats,
    getDistributionData,
    exportCSV,
    downloadCSV,
    resetFilters,
    getFilters,
    getTotalCount,
    getFilteredCount,
  };
})();
