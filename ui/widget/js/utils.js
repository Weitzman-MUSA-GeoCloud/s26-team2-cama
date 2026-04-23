/**
 * Utility functions for Property Owner Widget
 */

const Utils = (() => {
  /**
   * Format currency value
   * @param {number} value - Value to format
   * @returns {string} Formatted currency string
   */
  const formatCurrency = (value) => {
    if (!value && value !== 0) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  /**
   * Format percentage
   * @param {number} value - Percentage value
   * @returns {string} Formatted percentage string
   */
  const formatPercentage = (value) => {
    if (value === null || value === undefined) return '-';
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  /**
   * Format date
   * @param {string|Date} date - Date to format
   * @returns {string} Formatted date string
   */
  const formatDate = (date) => {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  /**
   * Format lot size
   * @param {number} squareFeet - Lot size in square feet
   * @returns {string} Formatted lot size
   */
  const formatLotSize = (squareFeet) => {
    if (!squareFeet) return '-';
    return `${Number(squareFeet).toLocaleString()} sq ft`;
  };

  /**
   * Calculate percentage change
   * @param {number} oldValue - Old value
   * @param {number} newValue - New value
   * @returns {number} Percentage change
   */
  const calculatePercentChange = (oldValue, newValue) => {
    if (oldValue === 0) return 0;
    return ((newValue - oldValue) / oldValue) * 100;
  };

  /**
   * Calculate dollar change
   * @param {number} oldValue - Old value
   * @param {number} newValue - New value
   * @returns {number} Dollar change
   */
  const calculateDollarChange = (oldValue, newValue) => {
    return newValue - oldValue;
  };

  /**
   * Deep clone an object
   * @param {object} obj - Object to clone
   * @returns {object} Cloned object
   */
  const deepClone = (obj) => {
    return JSON.parse(JSON.stringify(obj));
  };

  /**
   * Sort array by property
   * @param {array} arr - Array to sort
   * @param {string} prop - Property to sort by
   * @param {string} order - 'asc' or 'desc'
   * @returns {array} Sorted array
   */
  const sortBy = (arr, prop, order = 'asc') => {
    return [...arr].sort((a, b) => {
      if (a[prop] < b[prop]) return order === 'asc' ? -1 : 1;
      if (a[prop] > b[prop]) return order === 'asc' ? 1 : -1;
      return 0;
    });
  };

  /**
   * Calculate statistics from array
   * @param {array} data - Data array
   * @returns {object} Statistics object
   */
  const calculateStats = (data) => {
    if (!data || data.length === 0) {
      return {
        count: 0,
        sum: 0,
        mean: 0,
        median: 0,
        min: 0,
        max: 0,
        stdDev: 0,
      };
    }

    const sorted = [...data].sort((a, b) => a - b);
    const sum = data.reduce((acc, val) => acc + val, 0);
    const mean = sum / data.length;
    const median =
      data.length % 2 === 0
        ? (sorted[data.length / 2 - 1] + sorted[data.length / 2]) / 2
        : sorted[Math.floor(data.length / 2)];

    const variance =
      data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
      data.length;
    const stdDev = Math.sqrt(variance);

    return {
      count: data.length,
      sum,
      mean,
      median,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      stdDev,
    };
  };

  /**
   * Get color based on value
   * @param {number} value - Value
   * @param {number} min - Minimum range
   * @param {number} max - Maximum range
   * @returns {string} Color hex code
   */
  const getValueColor = (value, min, max) => {
    if (value < min) return '#a0caff'; // Blue (low)
    if (value > max) return '#ffb2b6'; // Red (high)
    return '#a0caff'; // Default blue
  };

  /**
   * Get change color
   * @param {number} change - Change percentage
   * @returns {string} Color hex code
   */
  const getChangeColor = (change) => {
    if (change < 0) return '#a0caff'; // Blue (decrease)
    if (change > 0) return '#ffb2b6'; // Red (increase)
    return '#e2e2e2'; // Neutral
  };

  /**
   * Check if value is within neighborhood range
   * @param {number} value - Value to check
   * @param {number} neighborhoodAvg - Neighborhood average
   * @param {number} tolerance - Tolerance percentage
   * @returns {boolean} True if within range
   */
  const isInNeighborhoodRange = (value, neighborhoodAvg, tolerance = 0.2) => {
    const lower = neighborhoodAvg * (1 - tolerance);
    const upper = neighborhoodAvg * (1 + tolerance);
    return value >= lower && value <= upper;
  };

  /**
   * Get comparison text
   * @param {number} value - Property value
   * @param {number} neighborhoodAvg - Neighborhood average
   * @returns {string} Comparison text
   */
  const getComparisonText = (value, neighborhoodAvg) => {
    if (!value || !neighborhoodAvg) return '-';
    const diff = value - neighborhoodAvg;
    const percent = ((diff / neighborhoodAvg) * 100).toFixed(1);
    if (Math.abs(percent) < 5) return 'About the same';
    return diff > 0
      ? `${percent}% above neighborhood avg`
      : `${Math.abs(percent)}% below neighborhood avg`;
  };

  // Public API
  return {
    formatCurrency,
    formatPercentage,
    formatDate,
    formatLotSize,
    calculatePercentChange,
    calculateDollarChange,
    deepClone,
    sortBy,
    calculateStats,
    getValueColor,
    getChangeColor,
    isInNeighborhoodRange,
    getComparisonText,
  };
})();
