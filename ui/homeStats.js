const HomeStats = (() => {
  const GEOJSON_URL =
    'https://storage.googleapis.com/musa5090s26-team2-temp_data/property_tile_info.geojson';

  const init = async () => {
    try {
      const response = await fetch(GEOJSON_URL);
      if (!response.ok) {
        throw new Error(`Failed to load GeoJSON: ${response.status}`);
      }

      const geojson = await response.json();
      const stats = calculateStats(geojson.features || []);
      renderStats(stats);
    } catch (error) {
      console.error('Error loading home statistics:', error);
      setText('homeTotalProperties', 'Unavailable');
      setText('homePropertiesIncreased', 'Unavailable');
      setText('homeAverageIncrease', 'Unavailable');
      setText('homeTotalAssessedValue', 'Unavailable');
      updateMeta(0, 'Unable to load GCS data');
    }
  };

  const calculateStats = (features) => {
    let totalAssessedValue = 0;
    let increasedCount = 0;
    const changes = [];

    features.forEach((feature) => {
      const props = feature.properties || {};
      const predictedValue = Number(props.predicted_value || 0);
      const lastYearValue = props.log_price
        ? Math.exp(Number(props.log_price))
        : predictedValue;

      totalAssessedValue += predictedValue;

      if (lastYearValue > 0) {
        const changePercent = ((predictedValue - lastYearValue) / lastYearValue) * 100;
        changes.push(changePercent);
        if (changePercent > 0) increasedCount++;
      }
    });

    const averageChange = changes.length
      ? changes.reduce((sum, value) => sum + value, 0) / changes.length
      : 0;
    const medianChange = median(changes);

    return {
      totalCount: features.length,
      increasedCount,
      increasedShare: features.length ? (increasedCount / features.length) * 100 : 0,
      averageChange,
      medianChange,
      totalAssessedValue,
    };
  };

  const renderStats = (stats) => {
    setText('homeTotalProperties', stats.totalCount.toLocaleString());
    setText('homePropertiesIncreased', stats.increasedCount.toLocaleString());
    setText('homeAverageIncrease', `${stats.averageChange.toFixed(1)}%`);
    setText('homeTotalAssessedValue', formatCompactCurrency(stats.totalAssessedValue));

    updateMeta(0, 'Modeled properties currently available on the map');
    updateMeta(1, `${stats.increasedShare.toFixed(1)}% of modeled parcels show a positive change`);
    updateMeta(2, `Median change in the modeled parcel set: ${stats.medianChange.toFixed(1)}%`);
    updateMeta(3, 'Sum of predicted values across the modeled parcel set');
  };

  const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  };

  const formatCompactCurrency = (value) => {
    if (value >= 1_000_000_000_000) {
      return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
    }
    if (value >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(1)}B`;
    }
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(1)}M`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  const updateMeta = (cardIndex, text) => {
    const cards = document.querySelectorAll('.stat-card');
    const meta = cards[cardIndex]?.querySelector('.landing-stat-meta');
    if (meta) meta.textContent = text;
  };

  return { init };
})();

document.addEventListener('DOMContentLoaded', HomeStats.init);
