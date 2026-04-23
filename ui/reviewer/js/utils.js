/**
 * Utility Functions for Tax Assessor Review Interface
 * Provides data formatting, color mapping, and helper functions
 */

const Utils = (() => {
  /**
   * Format currency values (e.g., 345000 -> "$345,000")
   * @param {number} value - The value to format
   * @returns {string} Formatted currency string
   */
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  /**
   * Format percentage values (e.g., 4.9 -> "4.9%")
   * @param {number} value - The percentage value
   * @param {number} decimals - Number of decimal places (default 1)
   * @returns {string} Formatted percentage string
   */
  const formatPercentage = (value, decimals = 1) => {
    if (value === null || value === undefined) return '-';
    return `${value.toFixed(decimals)}%`;
  };

  /**
   * Format date strings (e.g., "2023-10-24" -> "Oct 24, 2023")
   * @param {string} dateStr - The date string in ISO format
   * @returns {string} Formatted date string
   */
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  /**
   * Get color based on assessed value (gradient from blue to red)
   * @param {number} value - The property value
   * @param {number} minValue - Minimum value in range
   * @param {number} maxValue - Maximum value in range
   * @returns {string} RGB color string
   */
  const getValueColor = (value, minValue, maxValue) => {
    if (minValue === maxValue) return '#a0caff'; // Primary blue

    const normalized = (value - minValue) / (maxValue - minValue);
    // Gradient from blue (#a0caff) to red (#ffb2b6)
    const blue = [160, 202, 255];
    const red = [255, 178, 182];

    const r = Math.round(blue[0] + (red[0] - blue[0]) * normalized);
    const g = Math.round(blue[1] + (red[1] - blue[1]) * normalized);
    const b = Math.round(blue[2] + (red[2] - blue[2]) * normalized);

    return `rgb(${r}, ${g}, ${b})`;
  };

  /**
   * Get color based on percentage change
   * @param {number} percentChange - The percentage change
   * @returns {string} Color hex value
   */
  const getChangeColor = (percentChange) => {
    if (percentChange > 20) return '#ffb2b6'; // Red - high increase
    if (percentChange > 10) return '#ffb2b6'; // Pink - moderate increase
    if (percentChange > 0) return '#a0caff'; // Blue - small increase
    return '#a0caff'; // Blue - no change or decrease
  };

  /**
   * Calculate statistics from array of numbers
   * @param {array} values - Array of numeric values
   * @returns {object} Statistics object with min, max, mean, median
   */
  const calculateStats = (values) => {
    if (!values || values.length === 0) {
      return { min: 0, max: 0, mean: 0, median: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const median =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

    return { min, max, mean, median };
  };

  /**
   * Debounce function for event handlers
   * @param {function} func - Function to debounce
   * @param {number} delay - Delay in milliseconds
   * @returns {function} Debounced function
   */
  const debounce = (func, delay = 300) => {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  };

  /**
   * Throttle function for event handlers
   * @param {function} func - Function to throttle
   * @param {number} delay - Delay in milliseconds
   * @returns {function} Throttled function
   */
  const throttle = (func, delay = 300) => {
    let lastCall = 0;
    return function (...args) {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        func.apply(this, args);
      }
    };
  };

  /**
   * Deep clone an object
   * @param {object} obj - Object to clone
   * @returns {object} Cloned object
   */
  const deepClone = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map((item) => deepClone(item));
    if (obj instanceof Object) {
      const clonedObj = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
  };

  /**
   * Sort array of objects by property
   * @param {array} arr - Array to sort
   * @param {string} prop - Property name to sort by
   * @param {string} order - 'asc' or 'desc'
   * @returns {array} Sorted array
   */
  const sortBy = (arr, prop, order = 'asc') => {
    return [...arr].sort((a, b) => {
      const aVal = a[prop];
      const bVal = b[prop];

      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
  };

  /**
   * Filter array by multiple criteria
   * @param {array} arr - Array to filter
   * @param {object} criteria - Filter criteria object
   * @returns {array} Filtered array
   */
  const filterBy = (arr, criteria) => {
    return arr.filter((item) => {
      for (const key in criteria) {
        if (criteria.hasOwnProperty(key)) {
          if (item[key] !== criteria[key]) return false;
        }
      }
      return true;
    });
  };

  /**
   * Generate unique ID
   * @returns {string} Unique ID string
   */
  const generateId = () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  /**
   * Check if value is within range
   * @param {number} value - Value to check
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {boolean} True if within range
   */
  const isInRange = (value, min, max) => {
    return value >= min && value <= max;
  };

  // Public API
  return {
    formatCurrency,
    formatPercentage,
    formatDate,
    getValueColor,
    getChangeColor,
    calculateStats,
    debounce,
    throttle,
    deepClone,
    sortBy,
    filterBy,
    generateId,
    isInRange,
  };
})();
