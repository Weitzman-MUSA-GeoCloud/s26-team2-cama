const AssessorSidebar = (() => {
  let selectedProperty = null;
  let activeDistributionBins = {
    predicted: null,
    market: null,
  };
  const TRANSACTION_TREND_URL =
    'https://storage.googleapis.com/musa5090s26-team2-public/configs/transaction_volume_trend.json?v=20260429-recent';
  const TAX_YEAR_DATA_URL =
    'https://storage.googleapis.com/musa5090s26-team2-public/configs/tax_year_assessment_bins.json';
  const CURRENT_YEAR = new Date().getFullYear();
  const REFERENCE_YEAR = CURRENT_YEAR - 1;
  let marketFallbackBins = [];
  let marketFallbackPromise = null;

  const init = () => {
    document
      .getElementById('clearSelectedPropertyBtn')
      ?.addEventListener('click', clearSelection);
    document
      .getElementById('closeSelectedSheetBtn')
      ?.addEventListener('click', clearSelection);
    document
      .getElementById('streetViewToggle')
      ?.addEventListener('click', toggleStreetView);
    document.querySelectorAll('[data-mobile-selected-tab]').forEach((button) => {
      button.addEventListener('click', () => setMobileSelectedTab(button.dataset.mobileSelectedTab));
    });
    loadMarketFallbackBins();
  };

  const renderDefault = () => {
    selectedProperty = null;
    document.getElementById('assessorDefaultPanel')?.classList.remove('hidden');
    document.getElementById('assessorSelectedPanel')?.classList.add('hidden');

    const properties = getProperties();
    if (typeof DistributionChart !== 'undefined') {
      DistributionChart.renderSidebarPrice?.(properties, {
        onBarClick: (bin) => applyDistributionBinFilter('predicted', bin),
        activeBin: activeDistributionBins.predicted,
      });
      DistributionChart.renderSidebarMarket?.(properties, {
        onBarClick: (bin) => applyDistributionBinFilter('market', bin),
        activeBin: activeDistributionBins.market,
      });
    } else {
      renderHistogram('priceDistributionChart', properties, 'predicted_value', {
        color: '#a0caff',
        domain: [0, 1000000],
      });
      renderHistogram('marketDistributionChart', properties, 'market_value', {
        color: '#8bd7c5',
        domain: [0, 1000000],
      });
    }
    renderTransactionTrend(properties);
  };

  const showProperty = (property) => {
    if (!property) return;
    selectedProperty = property;
    document.body.classList.add('mobile-property-selected');
    setMobileSelectedTab('details');
    const hasPredictedValue = Number.isFinite(property.predicted_value);
    const baselineValue = property.market_value || property.tax_year_value || null;
    document.getElementById('assessorDefaultPanel')?.classList.add('hidden');
    document.getElementById('assessorSelectedPanel')?.classList.remove('hidden');

    setText('selectedPropertyAddress', property.address);
    setText('selectedPropertyId', property.id);
    updateStreetViewLink(property);
    setText('detailAddress', property.address);
    setText('detailMarketValueLabel', `Market Value (${REFERENCE_YEAR})`);
    setText('detailPredictedValueLabel', `Predicted Value (${CURRENT_YEAR})`);
    setText('detailAssessedValue', Utils.formatCurrency(baselineValue));
    setText('detailPredictedValue', Utils.formatCurrency(hasPredictedValue ? property.predicted_value : null));
    setText('detailLatestSale', Utils.formatCurrency(property.sale_price));
    setText('detailSaleDate', formatSaleDate(property.sale_date));
    setText(
      'detailMetadata',
      [property.bldg_desc, property.zip_code ? `ZIP ${property.zip_code}` : null]
        .filter(Boolean)
        .join(' | ') || '-'
    );

    if (hasPredictedValue && Number.isFinite(property.tax_year_value)) {
      const changeAmount = property.predicted_value - property.tax_year_value;
      const sign = changeAmount >= 0 ? '+' : '';
      setText('selectedAbsoluteChange', `${sign}${Utils.formatCurrency(changeAmount)}`);
      setText(
        'selectedPercentChange',
        Number.isFinite(property.change_percent)
          ? `${sign}${Utils.formatPercentage(property.change_percent)}`
          : '-'
      );
    } else {
      setText('selectedAbsoluteChange', '-');
      setText('selectedPercentChange', '-');
    }

    requestAnimationFrame(() => {
      const selectedDistributionProperties = [property];
      renderHistogram('selectedAssessmentDistribution', selectedDistributionProperties, 'predicted_value', {
        color: '#a0caff',
        domain: [0, 1000000],
        markerValue: hasPredictedValue ? property.predicted_value : null,
      });
      renderMarketDistribution();
      renderTrend(property);
    });
  };

  const clearSelection = () => {
    selectedProperty = null;
    document.body.classList.remove('mobile-property-selected', 'mobile-chart-tab');
    if (typeof MapInteraction !== 'undefined') {
      MapInteraction.clearSelection?.();
    }
    renderDefault();
  };

  const refresh = () => {
    if (selectedProperty) {
      showProperty(selectedProperty);
    } else {
      renderDefault();
    }
  };

  const applyDistributionBinFilter = (field, bin) => {
    if (!bin) return;
    const current = activeDistributionBins[field];
    const isSameBin =
      current &&
      Math.round(current.x0) === Math.round(bin.x0) &&
      Math.round(current.x1) === Math.round(bin.x1);

    if (isSameBin) {
      if (field === 'predicted') {
        const extents = DataManager.getFilterExtents?.();
        DataManager.setFilters({
          priceMin: extents?.predictedMin ?? 0,
          priceMax: extents?.predictedMax ?? 5000000,
          marketMin: null,
          marketMax: null,
        });
        ChartFiltering?.updateSliderDisplay?.({
          priceMin: extents?.predictedMin ?? 0,
          priceMax: extents?.predictedMax ?? 5000000,
        });
      } else {
        DataManager.clearRangeDrilldown?.();
      }

      activeDistributionBins[field] = null;
      if (typeof App !== 'undefined' && typeof App.handleExternalFilterRefresh === 'function') {
        App.handleExternalFilterRefresh();
      }
      PropertyPopup.showNotification(
        `${field === 'predicted' ? 'Predicted' : 'Market'} distribution filter cleared`,
        'info'
      );
      return;
    }

    if (typeof DataManager !== 'undefined') {
      DataManager.setChartRangeFilter(field, bin.x0, bin.x1);
    }
    activeDistributionBins[field] = { x0: bin.x0, x1: bin.x1 };
    if (typeof ChartFiltering !== 'undefined') {
      if (field === 'predicted') {
        ChartFiltering.updateSliderDisplay({
          priceMin: Math.round(bin.x0),
          priceMax: Math.round(bin.x1),
        });
      }
    }
    if (typeof App !== 'undefined' && typeof App.handleExternalFilterRefresh === 'function') {
      App.handleExternalFilterRefresh();
    }
    PropertyPopup.showNotification(
      `${field === 'predicted' ? 'Predicted' : 'Market'} distribution bin applied to map`,
      'info'
    );
  };

  const clearDistributionBinFilters = () => {
    activeDistributionBins = {
      predicted: null,
      market: null,
    };
  };

  const getActiveDistributionBin = (field) => activeDistributionBins[field] || null;

  const renderMarketDistribution = () => {
    if (!selectedProperty) return;
    const markerValue = selectedProperty.market_value || selectedProperty.tax_year_value;
    renderHistogram('selectedToggleDistribution', [selectedProperty], 'market_value', {
      color: '#8bd7c5',
      domain: [0, 1000000],
      markerValue,
    });
  };

  const renderTrend = (property) => {
    const container = document.getElementById('selectedValueTrend');
    if (!container) return;
    container.innerHTML = '';

    const values = [
      { label: `Market (${REFERENCE_YEAR})`, value: property.market_value || property.tax_year_value },
      Number.isFinite(property.predicted_value)
        ? { label: `Predicted (${CURRENT_YEAR})`, value: property.predicted_value }
        : null,
    ].filter(Boolean);

    const { width, height } = getSize(container);
    const margin = { top: 18, right: 18, bottom: 30, left: 54 };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;
    const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const x = d3.scalePoint().domain(values.map((d) => d.label)).range([0, chartW]).padding(0.5);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(values, (d) => d.value) || 1])
      .nice()
      .range([chartH, 0]);

    g.append('path')
      .datum(values)
      .attr('fill', 'none')
      .attr('stroke', '#a0caff')
      .attr('stroke-width', 2.5)
      .attr('d', d3.line().x((d) => x(d.label)).y((d) => y(d.value)));
    g.selectAll('circle')
      .data(values)
      .enter()
      .append('circle')
      .attr('cx', (d) => x(d.label))
      .attr('cy', (d) => y(d.value))
      .attr('r', 4)
      .attr('fill', '#ffb2b6');
    g.append('g')
      .attr('transform', `translate(0,${chartH})`)
      .call(d3.axisBottom(x))
      .style('color', 'rgba(226,226,226,0.55)')
      .style('font-size', '10px');
    g.append('g')
      .call(d3.axisLeft(y).ticks(3).tickFormat((d) => `$${d3.format('~s')(d)}`))
      .style('color', 'rgba(226,226,226,0.55)')
      .style('font-size', '10px');
  };

  const renderHistogram = (containerId, properties, field, opts = {}) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const values = properties
      .map((p) => Number(p[field]))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (!values.length) {
      if (field === 'market_value' && renderMarketFallbackHistogram(container, opts)) {
        return;
      }
      container.textContent = 'No data';
      return;
    }

    const domain = opts.domain || [0, d3.max(values)];
    const binCount = 20;
    const step = (domain[1] - domain[0]) / binCount;
    const bins = Array.from({ length: binCount }, (_, i) => ({
      x0: domain[0] + i * step,
      x1: domain[0] + (i + 1) * step,
      count: 0,
    }));
    values.forEach((value) => {
      const clamped = Math.min(Math.max(value, domain[0]), domain[1]);
      let index = Math.floor((clamped - domain[0]) / step);
      if (index >= bins.length) index = bins.length - 1;
      bins[index].count++;
    });

    const { width, height } = getSize(container);
    const margin = { top: 12, right: 10, bottom: 24, left: 38 };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;
    const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const x = d3.scaleLinear().domain(domain).range([0, chartW]);
    const y = d3.scaleLinear().domain([0, d3.max(bins, (b) => b.count) || 1]).nice().range([chartH, 0]);

    g.selectAll('rect')
      .data(bins)
      .enter()
      .append('rect')
      .attr('x', (b) => x(b.x0) + 1)
      .attr('y', (b) => y(b.count))
      .attr('width', (b) => Math.max(1, x(b.x1) - x(b.x0) - 2))
      .attr('height', (b) => chartH - y(b.count))
      .attr('fill', opts.color || '#a0caff')
      .attr('opacity', 0.85);

    if (Number.isFinite(opts.markerValue)) {
      const markerX = x(Math.min(Math.max(opts.markerValue, domain[0]), domain[1]));
      g.append('line')
        .attr('x1', markerX)
        .attr('x2', markerX)
        .attr('y1', 0)
        .attr('y2', chartH)
        .attr('stroke', '#e20546')
        .attr('stroke-width', 2);
    }

    g.append('g')
      .attr('transform', `translate(0,${chartH})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat((d) => `$${d / 1000}k`))
      .style('color', 'rgba(226,226,226,0.55)')
      .style('font-size', '10px');
    g.append('g')
      .call(d3.axisLeft(y).ticks(3).tickFormat(d3.format('~s')))
      .style('color', 'rgba(226,226,226,0.55)')
      .style('font-size', '10px');
  };

  const renderTransactionTrend = async () => {
    const container = document.getElementById('transactionTrendChart');
    if (!container) return;
    container.textContent = 'Trend loading...';

    try {
      const response = await fetch(TRANSACTION_TREND_URL);
      if (!response.ok) throw new Error(`Transaction trend ${response.status}`);
      const data = await response.json();
      renderLineChart(container, data, 'sale_year', 'transaction_count', {
        color: '#8bd7c5',
        xFormat: (d) => String(d),
        yFormat: d3.format('~s'),
      });
    } catch (error) {
      container.innerHTML =
        '<div class="px-4 text-center text-xs text-[#e2e2e2]/45">Transaction trend data is not available.</div>';
    }
  };

  const renderLineChart = (container, data, xField, yField, opts = {}) => {
    container.innerHTML = '';
    if (!data?.length) {
      container.textContent = 'No data';
      return;
    }

    const { width, height } = getSize(container);
    const margin = { top: 12, right: 12, bottom: 24, left: 42 };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;
    const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const x = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => Number(d[xField])))
      .range([0, chartW]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => Number(d[yField])) || 1])
      .nice()
      .range([chartH, 0]);

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', opts.color || '#a0caff')
      .attr('stroke-width', 2)
      .attr(
        'd',
        d3
          .line()
          .x((d) => x(Number(d[xField])))
          .y((d) => y(Number(d[yField])))
      );

    g.append('g')
      .attr('transform', `translate(0,${chartH})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat(opts.xFormat || ((d) => d)))
      .style('color', 'rgba(226,226,226,0.55)')
      .style('font-size', '10px');
    g.append('g')
      .call(d3.axisLeft(y).ticks(3).tickFormat(opts.yFormat || d3.format('~s')))
      .style('color', 'rgba(226,226,226,0.55)')
      .style('font-size', '10px');
  };

  const loadMarketFallbackBins = () => {
    if (marketFallbackPromise) return marketFallbackPromise;
    marketFallbackPromise = fetch(TAX_YEAR_DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Tax-year bins ${response.status}`);
        return response.json();
      })
      .then((rows) => {
        const data = Array.isArray(rows) ? rows : [];
        const years = [...new Set(data.map((row) => Number(row.tax_year)).filter(Number.isFinite))]
          .sort((a, b) => a - b);
        const latestYear = years.at(-1);
        marketFallbackBins = data
          .filter((row) => Number(row.tax_year) === Number(latestYear))
          .map((row) => ({
            x0: Number(row.lower_bound),
            x1: Number(row.upper_bound),
            count: Number(row.property_count || 0),
          }))
          .filter((bin) =>
            Number.isFinite(bin.x0) &&
            Number.isFinite(bin.x1) &&
            Number.isFinite(bin.count) &&
            bin.x1 > bin.x0
          );
        return marketFallbackBins;
      })
      .catch((error) => {
        console.warn('Market fallback bins unavailable:', error);
        marketFallbackBins = [];
        return [];
      });
    return marketFallbackPromise;
  };

  const renderMarketFallbackHistogram = (container, opts = {}) => {
    if (!marketFallbackBins.length) {
      loadMarketFallbackBins().then(() => {
        if (selectedProperty) renderMarketDistribution();
      });
      return false;
    }

    renderBins(container, marketFallbackBins, opts);
    return true;
  };

  const renderBins = (container, bins, opts = {}) => {
    const { width, height } = getSize(container);
    const margin = { top: 12, right: 10, bottom: 24, left: 38 };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;
    const domain = opts.domain || [bins[0].x0, bins[bins.length - 1].x1];
    const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const x = d3.scaleLinear().domain(domain).range([0, chartW]);
    const y = d3.scaleLinear().domain([0, d3.max(bins, (b) => b.count) || 1]).nice().range([chartH, 0]);

    g.selectAll('rect')
      .data(bins)
      .enter()
      .append('rect')
      .attr('x', (b) => x(b.x0) + 1)
      .attr('y', (b) => y(b.count))
      .attr('width', (b) => Math.max(1, x(b.x1) - x(b.x0) - 2))
      .attr('height', (b) => chartH - y(b.count))
      .attr('fill', opts.color || '#8bd7c5')
      .attr('opacity', 0.85);

    if (Number.isFinite(opts.markerValue)) {
      const markerX = x(Math.min(Math.max(opts.markerValue, domain[0]), domain[1]));
      g.append('line')
        .attr('x1', markerX)
        .attr('x2', markerX)
        .attr('y1', 0)
        .attr('y2', chartH)
        .attr('stroke', '#e20546')
        .attr('stroke-width', 2);
    }

    g.append('g')
      .attr('transform', `translate(0,${chartH})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat((d) => `$${d / 1000}k`))
      .style('color', 'rgba(226,226,226,0.55)')
      .style('font-size', '10px');
    g.append('g')
      .call(d3.axisLeft(y).ticks(3).tickFormat(d3.format('~s')))
      .style('color', 'rgba(226,226,226,0.55)')
      .style('font-size', '10px');
  };

  const getProperties = () => DataManager.getFilteredProperties();

  const getDistributionProperties = () => {
    const filtered = DataManager.getFilteredProperties?.() || [];
    if (filtered.length) return filtered;
    return DataManager.getAllProperties?.() || filtered;
  };

  const getSize = (container) => ({
    width: Math.max(container.clientWidth || 260, 220),
    height: Math.max(container.clientHeight || 150, 120),
  });

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || '-';
  };

  const formatSaleDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const setMobileSelectedTab = (tab) => {
    const activeTab = tab === 'charts' ? 'charts' : 'details';
    document.body.classList.toggle('mobile-chart-tab', activeTab === 'charts');
    document.querySelectorAll('[data-mobile-selected-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mobileSelectedTab === activeTab);
    });
  };

  const buildStreetViewSrc = (lat, lng) =>
    `https://www.google.com/maps?layer=c&cbll=${lat},${lng}&cbp=11,0,0,0,0&output=svembed`;

  const updateStreetViewLink = (property) => {
    const toggle = document.getElementById('streetViewToggle');
    const container = document.getElementById('streetViewContainer');
    const frame = document.getElementById('streetViewFrame');
    const label = document.getElementById('streetViewToggleLabel');
    if (!toggle || !container || !frame) return;

    // Always collapse + clear iframe when switching property so the old view doesn't linger
    container.classList.add('hidden');
    toggle.setAttribute('aria-expanded', 'false');
    if (label) label.textContent = 'View Street View';
    frame.src = 'about:blank';

    const lat = Number(property?.lat);
    const lng = Number(property?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      toggle.disabled = false;
      toggle.classList.remove('opacity-50', 'cursor-not-allowed');
      toggle.dataset.lat = String(lat);
      toggle.dataset.lng = String(lng);
    } else {
      toggle.disabled = true;
      toggle.classList.add('opacity-50', 'cursor-not-allowed');
      delete toggle.dataset.lat;
      delete toggle.dataset.lng;
    }
  };

  const toggleStreetView = () => {
    const toggle = document.getElementById('streetViewToggle');
    const container = document.getElementById('streetViewContainer');
    const frame = document.getElementById('streetViewFrame');
    const label = document.getElementById('streetViewToggleLabel');
    if (!toggle || !container || !frame) return;

    const lat = Number(toggle.dataset.lat);
    const lng = Number(toggle.dataset.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const isHidden = container.classList.contains('hidden');
    if (isHidden) {
      frame.src = buildStreetViewSrc(lat, lng);
      container.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'true');
      if (label) label.textContent = 'Hide Street View';
    } else {
      container.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
      if (label) label.textContent = 'View Street View';
      frame.src = 'about:blank';
    }
  };

  return {
    init,
    renderDefault,
    showProperty,
    clearSelection,
    refresh,
    applyDistributionBinFilter,
    clearDistributionBinFilters,
    getActiveDistributionBin,
  };
})();
