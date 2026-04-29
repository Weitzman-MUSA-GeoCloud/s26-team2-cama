const DistributionChart = (() => {
  const TAX_YEAR_DATA_URL =
    'https://storage.googleapis.com/musa5090s26-team2-public/configs/tax_year_assessment_bins.json';
  const CURRENT_DATA_URL =
    'https://storage.googleapis.com/musa5090s26-team2-public/configs/current_assessment_bins.json';
  const TRANSACTION_TREND_URL =
    'https://storage.googleapis.com/musa5090s26-team2-public/configs/transaction_volume_trend.json';

  const colors = {
    bg: '#121414',
    text: '#e2e2e2',
    textMuted: 'rgba(226, 226, 226, 0.55)',
    grid: 'rgba(226, 226, 226, 0.1)',
    predicted: '#a0caff',
    predictedHover: '#f4f8ff',
    predictedActive: '#d7eaff',
    market: '#8bd7c5',
    marketHover: '#d8fff6',
    marketActive: '#f4fffb',
    year2025: '#ff9b6a',
    year2026: '#6db4ff',
    trend: '#ffb2b6',
  };

  let cachedTaxYearData = [];
  let cachedCurrentData = [];
  let cachedTrendData = [];
  let latestTaxYears = [];
  let visibleTaxYears = new Set();

  const init = async () => {
    try {
      const [taxYearData, currentData, trendData] = await Promise.all([
        fetch(TAX_YEAR_DATA_URL).then((r) => r.json()),
        fetch(CURRENT_DATA_URL).then((r) => r.json()),
        fetch(TRANSACTION_TREND_URL).then((r) => r.json()),
      ]);

      cachedTaxYearData = Array.isArray(taxYearData) ? taxYearData : [];
      cachedCurrentData = Array.isArray(currentData) ? currentData : [];
      cachedTrendData = Array.isArray(trendData) ? trendData : [];
      latestTaxYears = getLatestYears(cachedTaxYearData, 2);
      visibleTaxYears = new Set(latestTaxYears.slice(-1).map(String));

      renderTaxYearChart();
      renderTrendChart();
      setupChartModal();

      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          renderTaxYearChart();
          renderTrendChart();
        }, 200);
      });
    } catch (error) {
      console.error('Failed to initialize distribution charts:', error);
      showContainerError('bottomLeftChart', 'Failed to load chart data');
      showContainerError('bottomRightChart', 'Failed to load chart data');
    }
  };

  const setupChartModal = () => {
    document.querySelectorAll('[data-chart]').forEach((button) => {
      button.addEventListener('click', () => openChartModal(button.dataset.chart));
    });

    document.querySelectorAll('[data-chart-expand]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        openChartModal(button.dataset.chartExpand);
      });
    });

    const modal = document.getElementById('chartModal');
    const closeBtn = document.getElementById('closeChartModalBtn');
    closeBtn?.addEventListener('click', closeChartModal);
    modal?.addEventListener('click', (event) => {
      if (event.target === modal) closeChartModal();
    });
  };

  const openChartModal = (chartType) => {
    const modal = document.getElementById('chartModal');
    const body = document.getElementById('chartModalBody');
    const title = document.getElementById('chartModalTitle');
    const note = document.getElementById('chartModalNote');
    if (!modal || !body || !title || !note) return;

    body.innerHTML = '';
    modal.classList.remove('hidden');

    if (chartType === 'tax') {
      title.textContent = 'Market Value Distribution';
      note.textContent = 'Use mouse wheel to zoom. Double-click to reset.';
      renderZoomableTaxYearChart(body);
      return;
    }

    if (chartType === 'trend') {
      title.textContent = 'Transaction Trend';
      note.textContent = 'Use mouse wheel to zoom. Double-click to reset.';
      renderZoomableTrendChart(body);
      return;
    }

    if (chartType === 'sidebar-predicted') {
      title.textContent = 'Predicted Value Distribution';
      note.textContent = 'Display preview only.';
      renderExpandedSidebarHistogram(
        body,
        buildPropertyHistogram('predicted'),
        colors.predicted,
      );
      return;
    }

    if (chartType === 'sidebar-market') {
      title.textContent = 'Market Value Distribution';
      note.textContent = 'Display preview only.';
      renderExpandedSidebarHistogram(
        body,
        buildPropertyHistogram('market'),
        colors.market,
      );
    }
  };

  const closeChartModal = () => {
    document.getElementById('chartModal')?.classList.add('hidden');
  };

  const getLatestYears = (data, count = 2) => {
    const years = [...new Set(data.map((d) => Number(d.tax_year)).filter(Number.isFinite))]
      .sort((a, b) => a - b);
    return years.slice(-count);
  };

  const renderTaxYearChart = () => {
    const container = document.getElementById('bottomLeftChart');
    if (!container) return;
    container.innerHTML = '';

    const filtered = cachedTaxYearData.filter((item) =>
      latestTaxYears.includes(Number(item.tax_year)),
    );
    renderTaxYearLineChart(container, filtered, {
      interactiveLegend: false,
      compact: true,
      latestYearOnly: true,
    });
  };

  const renderTrendChart = () => {
    const container = document.getElementById('bottomRightChart');
    if (!container) return;
    container.innerHTML = '';
    const latestFive = [...cachedTrendData]
      .filter((item) => Number.isFinite(Number(item.sale_year)))
      .sort((a, b) => Number(a.sale_year) - Number(b.sale_year))
      .slice(-5);
    renderSimpleLineChart(container, latestFive, {
      xField: 'sale_year',
      yField: 'transaction_count',
      color: colors.trend,
      yTicks: 4,
      xTickFormatter: (value) => String(value),
      yTickFormatter: d3.format('~s'),
      compact: true,
    });
  };

  const renderZoomableTaxYearChart = (container) => {
    renderTaxYearLineChart(container, cachedTaxYearData.filter((item) =>
      latestTaxYears.includes(Number(item.tax_year)),
    ), {
      interactiveLegend: true,
      compact: false,
      latestYearOnly: false,
    });
  };

  const renderZoomableTrendChart = (container) => {
    const latestFive = [...cachedTrendData]
      .filter((item) => Number.isFinite(Number(item.sale_year)))
      .sort((a, b) => Number(a.sale_year) - Number(b.sale_year))
      .slice(-5);

    renderSimpleLineChart(container, latestFive, {
      xField: 'sale_year',
      yField: 'transaction_count',
      color: colors.trend,
      yTicks: 5,
      xTickFormatter: (value) => String(value),
      yTickFormatter: d3.format('~s'),
      compact: false,
      zoomable: true,
    });
  };

  const renderTaxYearLineChart = (container, data, opts = {}) => {
    if (!data.length) {
      container.innerHTML =
        '<div class="flex h-full items-center justify-center text-xs text-[#e2e2e2]/45">No market value data.</div>';
      return;
    }

    const width = Math.max(container.clientWidth || 480, 320);
    const height = Math.max(container.clientHeight || 220, 180);
    const margin = opts.compact
      ? { top: 18, right: 18, bottom: 30, left: 48 }
      : { top: 28, right: 32, bottom: 42, left: 64 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const grouped = d3.groups(data, (d) => String(d.tax_year)).sort(
      (a, b) => Number(a[0]) - Number(b[0]),
    );
    const yearSeries = grouped.map(([year, values]) => ({
      year,
      color: year === String(latestTaxYears.at(-1)) ? colors.year2026 : colors.year2025,
      values: values.sort((a, b) => Number(a.lower_bound) - Number(b.lower_bound)),
    }));

    const activeYears = opts.interactiveLegend
      ? new Set(visibleTaxYears.size ? [...visibleTaxYears] : [String(latestTaxYears.at(-1))])
      : new Set(opts.latestYearOnly ? [String(latestTaxYears.at(-1))] : latestTaxYears.map(String));

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => Number(d.upper_bound)) || 1000000])
      .range([0, chartWidth]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => Number(d.property_count)) || 1])
      .nice()
      .range([chartHeight, 0]);

    const baseX = x.copy();

    const xAxis = g.append('g').attr('transform', `translate(0,${chartHeight})`);
    const yAxis = g.append('g');
    const grid = g.append('g').attr('class', 'line-grid');
    const seriesLayer = g.append('g');
    const legendLayer = svg.append('g').attr('transform', `translate(${margin.left},${opts.compact ? 2 : 8})`);

    const draw = (xScale = x) => {
      grid
        .call(d3.axisLeft(y).ticks(opts.compact ? 4 : 5).tickSize(-chartWidth).tickFormat(''))
        .style('color', colors.grid);
      grid.selectAll('line').style('stroke', colors.grid);
      grid.select('.domain').remove();

      xAxis
        .call(
          d3.axisBottom(xScale)
            .ticks(opts.compact ? 5 : 7)
            .tickFormat((value) => `$${Math.round(value / 1000)}k`),
        )
        .style('color', colors.textMuted)
        .style('font-size', opts.compact ? '10px' : '12px');
      yAxis
        .call(d3.axisLeft(y).ticks(opts.compact ? 4 : 5).tickFormat(d3.format('~s')))
        .style('color', colors.textMuted)
        .style('font-size', opts.compact ? '10px' : '12px');

      const line = d3
        .line()
        .x((d) => xScale((Number(d.lower_bound) + Number(d.upper_bound)) / 2))
        .y((d) => y(Number(d.property_count)));

      const series = seriesLayer.selectAll('.tax-series').data(yearSeries, (d) => d.year);
      const seriesEnter = series.enter().append('g').attr('class', 'tax-series');
      seriesEnter.append('path').attr('class', 'tax-line');
      seriesEnter.append('g').attr('class', 'tax-points');

      seriesEnter.merge(series).each(function (seriesData) {
        const isActive = activeYears.has(seriesData.year);
        const group = d3.select(this);
        group
          .select('.tax-line')
          .datum(seriesData.values)
          .attr('fill', 'none')
          .attr('stroke', seriesData.color)
          .attr('stroke-width', isActive ? 3 : 2)
          .attr('opacity', isActive ? 0.95 : 0.12)
          .attr('d', line);

        const points = group
          .select('.tax-points')
          .selectAll('circle')
          .data(seriesData.values);

        points
          .enter()
          .append('circle')
          .merge(points)
          .attr('cx', (d) => xScale((Number(d.lower_bound) + Number(d.upper_bound)) / 2))
          .attr('cy', (d) => y(Number(d.property_count)))
          .attr('r', isActive ? 2.5 : 0)
          .attr('fill', seriesData.color)
          .attr('opacity', isActive ? 0.8 : 0);

        points.exit().remove();
      });

      series.exit().remove();

      if (opts.interactiveLegend) {
        legendLayer.selectAll('*').remove();
        yearSeries.forEach((seriesData, index) => {
          const active = activeYears.has(seriesData.year);
          const item = legendLayer
            .append('g')
            .attr('transform', `translate(${index * 140},0)`)
            .style('cursor', 'pointer')
            .on('click', () => {
              if (activeYears.has(seriesData.year)) {
                activeYears.delete(seriesData.year);
              } else {
                activeYears.add(seriesData.year);
              }
              if (activeYears.size === 0) {
                activeYears.add(String(latestTaxYears.at(-1)));
              }
              visibleTaxYears = new Set(activeYears);
              draw(xScale);
            });

          item
            .append('rect')
            .attr('width', 12)
            .attr('height', 12)
            .attr('fill', seriesData.color)
            .attr('opacity', active ? 1 : 0.28);

          item
            .append('text')
            .attr('x', 18)
            .attr('y', 10)
            .attr('fill', colors.text)
            .attr('font-size', 12)
            .attr('opacity', active ? 1 : 0.45)
            .text(seriesData.year);
        });
      }
    };

    if (opts.zoomable) {
      const zoom = d3
        .zoom()
        .scaleExtent([1, 12])
        .translateExtent([
          [0, 0],
          [chartWidth, chartHeight],
        ])
        .extent([
          [0, 0],
          [chartWidth, chartHeight],
        ])
        .on('zoom', (event) => draw(event.transform.rescaleX(baseX)));

      svg
        .append('rect')
        .attr('transform', `translate(${margin.left},${margin.top})`)
        .attr('width', chartWidth)
        .attr('height', chartHeight)
        .attr('fill', 'transparent')
        .style('cursor', 'grab')
        .call(zoom)
        .on('dblclick.zoom', null)
        .on('dblclick', () => {
          svg.transition().duration(200).call(zoom.transform, d3.zoomIdentity);
        });
    }

    draw();
  };

  const renderSimpleLineChart = (container, data, opts = {}) => {
    if (!data.length) {
      container.innerHTML =
        '<div class="flex h-full items-center justify-center text-xs text-[#e2e2e2]/45">No trend data.</div>';
      return;
    }

    const width = Math.max(container.clientWidth || 480, 320);
    const height = Math.max(container.clientHeight || 220, 180);
    const margin = opts.compact
      ? { top: 18, right: 18, bottom: 30, left: 48 }
      : { top: 24, right: 24, bottom: 40, left: 58 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const x = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => Number(d[opts.xField])) || [0, 1])
      .range([0, chartWidth]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => Number(d[opts.yField])) || 1])
      .nice()
      .range([chartHeight, 0]);
    const baseX = x.copy();
    const line = d3
      .line()
      .x((d) => x((Number(d[opts.xField]))))
      .y((d) => y(Number(d[opts.yField])));

    const xAxis = g.append('g').attr('transform', `translate(0,${chartHeight})`);
    const yAxis = g.append('g');
    const grid = g.append('g');
    const path = g.append('path').attr('fill', 'none').attr('stroke', opts.color || colors.trend).attr('stroke-width', 3);
    const points = g.append('g');

    const draw = (xScale = x) => {
      grid
        .call(d3.axisLeft(y).ticks(opts.yTicks || 4).tickSize(-chartWidth).tickFormat(''))
        .style('color', colors.grid);
      grid.selectAll('line').style('stroke', colors.grid);
      grid.select('.domain').remove();

      xAxis
        .call(
          d3.axisBottom(xScale)
            .ticks(data.length)
            .tickFormat(opts.xTickFormatter || ((value) => String(value))),
        )
        .style('color', colors.textMuted)
        .style('font-size', opts.compact ? '10px' : '12px');
      yAxis
        .call(
          d3.axisLeft(y)
            .ticks(opts.yTicks || 4)
            .tickFormat(opts.yTickFormatter || d3.format('~s')),
        )
        .style('color', colors.textMuted)
        .style('font-size', opts.compact ? '10px' : '12px');

      path.datum(data).attr(
        'd',
        d3.line().x((d) => xScale(Number(d[opts.xField]))).y((d) => y(Number(d[opts.yField]))),
      );

      const pointSel = points.selectAll('circle').data(data);
      pointSel
        .enter()
        .append('circle')
        .merge(pointSel)
        .attr('cx', (d) => xScale(Number(d[opts.xField])))
        .attr('cy', (d) => y(Number(d[opts.yField])))
        .attr('r', 4)
        .attr('fill', opts.color || colors.trend)
        .attr('opacity', 0.9);
      pointSel.exit().remove();
    };

    if (opts.zoomable) {
      const zoom = d3
        .zoom()
        .scaleExtent([1, 12])
        .translateExtent([
          [0, 0],
          [chartWidth, chartHeight],
        ])
        .extent([
          [0, 0],
          [chartWidth, chartHeight],
        ])
        .on('zoom', (event) => draw(event.transform.rescaleX(baseX)));

      svg
        .append('rect')
        .attr('transform', `translate(${margin.left},${margin.top})`)
        .attr('width', chartWidth)
        .attr('height', chartHeight)
        .attr('fill', 'transparent')
        .style('cursor', 'grab')
        .call(zoom)
        .on('dblclick.zoom', null)
        .on('dblclick', () => {
          svg.transition().duration(200).call(zoom.transform, d3.zoomIdentity);
        });
    }

    draw();
  };

  const buildPropertyHistogram = (field) => {
    const properties =
      typeof DataManager !== 'undefined' && typeof DataManager.getFilteredProperties === 'function'
        ? DataManager.getFilteredProperties()
        : [];
    const values = properties
      .map((property) =>
        field === 'predicted' ? property.predicted_value : property.market_value,
      )
      .filter((value) => Number.isFinite(value) && value > 0 && value < 2000000);
    return histogram(values, 20, [0, 1000000]);
  };

  const renderExpandedSidebarHistogram = (container, bins, color) => {
    if (!bins.length) {
      container.innerHTML =
        '<div class="flex h-full items-center justify-center text-xs text-[#e2e2e2]/45">No data</div>';
      return;
    }

    const width = Math.max(container.clientWidth || 860, 640);
    const height = Math.max(container.clientHeight || 420, 320);
    const margin = { top: 22, right: 24, bottom: 42, left: 56 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const x = d3
      .scaleLinear()
      .domain([bins[0].x0, bins[bins.length - 1].x1])
      .range([0, chartWidth]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(bins, (b) => b.count) || 1])
      .nice()
      .range([chartHeight, 0]);

    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickSize(-chartWidth).tickFormat(''))
      .style('color', colors.grid)
      .select('.domain')
      .remove();

    g.selectAll('rect')
      .data(bins)
      .enter()
      .append('rect')
      .attr('x', (b) => x(b.x0) + 2)
      .attr('y', (b) => y(b.count))
      .attr('width', (b) => Math.max(10, x(b.x1) - x(b.x0) - 4))
      .attr('height', (b) => chartHeight - y(b.count))
      .attr('fill', color)
      .attr('opacity', 0.92);

    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x).ticks(7).tickFormat((value) => `$${Math.round(value / 1000)}k`))
      .style('color', colors.textMuted)
      .style('font-size', '12px');

    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('~s')))
      .style('color', colors.textMuted)
      .style('font-size', '12px');
  };

  const histogram = (values, binCount, domain) => {
    if (!values.length) return [];
    const [min, max] = domain || [d3.min(values), d3.max(values)];
    if (min === max) return [{ x0: min, x1: max, count: values.length }];
    const step = (max - min) / binCount;
    const bins = Array.from({ length: binCount }, (_, index) => ({
      x0: min + index * step,
      x1: min + (index + 1) * step,
      count: 0,
    }));

    values.forEach((value) => {
      if (value < min || value > max) return;
      let index = Math.floor((value - min) / step);
      if (index >= binCount) index = binCount - 1;
      bins[index].count += 1;
    });

    return bins;
  };

  const renderMiniHistogram = (containerId, bins, opts = {}) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (!bins.length) {
      container.innerHTML =
        '<div class="flex items-center justify-center h-full text-xs text-[#e2e2e2]/40">No data</div>';
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 8, right: 8, bottom: 22, left: 32 };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleLinear()
      .domain([bins[0].x0, bins[bins.length - 1].x1])
      .range([0, chartW]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(bins, (b) => b.count) || 1])
      .nice()
      .range([chartH, 0]);

    const hasActiveBin =
      opts.activeBin &&
      Number.isFinite(opts.activeBin.x0) &&
      Number.isFinite(opts.activeBin.x1);
    const matchesActiveBin = (bin) =>
      hasActiveBin &&
      Math.round(bin.x0) === Math.round(opts.activeBin.x0) &&
      Math.round(bin.x1) === Math.round(opts.activeBin.x1);
    const baseX = (bin) => x(bin.x0) + 1;
    const baseY = (bin) => y(bin.count);
    const baseWidth = (bin) => Math.max(6, x(bin.x1) - x(bin.x0) - 2);
    const baseHeight = (bin) => Math.max(2, chartH - y(bin.count));
    const hoverWidth = (bin) => Math.max(baseWidth(bin) + 10, 14);
    const hoverHeight = (bin) => Math.max(baseHeight(bin) + 12, 18);
    const hoverX = (bin) =>
      Math.max(0, baseX(bin) - (hoverWidth(bin) - baseWidth(bin)) / 2);
    const hoverY = (bin) => Math.max(0, chartH - hoverHeight(bin));

    const fillColor = (bin, hovered = false) => {
      if (matchesActiveBin(bin)) return opts.activeColor || '#ffffff';
      if (hovered) return opts.hoverColor || '#f4f8ff';
      return opts.color || colors.predicted;
    };

    const opacityValue = (bin, hovered = false) => {
      if (matchesActiveBin(bin)) return 1;
      if (hovered) return 1;
      return hasActiveBin ? 0.2 : 0.88;
    };

    const strokeColor = (bin, hovered = false) => {
      if (matchesActiveBin(bin) || hovered) return opts.color || colors.predicted;
      return 'transparent';
    };

    const strokeWidth = (bin, hovered = false) => {
      if (matchesActiveBin(bin)) return 3;
      if (hovered) return 2;
      return 0;
    };

    const applyBaseState = (selection, bin) => {
      selection
        .transition()
        .duration(140)
        .attr('x', baseX(bin))
        .attr('y', baseY(bin))
        .attr('width', baseWidth(bin))
        .attr('height', baseHeight(bin))
        .attr('fill', fillColor(bin, false))
        .attr('opacity', opacityValue(bin, false))
        .attr('stroke', strokeColor(bin, false))
        .attr('stroke-width', strokeWidth(bin, false));
    };

    const applyHoverState = (selection, bin) => {
      selection
        .raise()
        .transition()
        .duration(140)
        .attr('x', hoverX(bin))
        .attr('y', hoverY(bin))
        .attr('width', hoverWidth(bin))
        .attr('height', hoverHeight(bin))
        .attr('fill', fillColor(bin, true))
        .attr('opacity', opacityValue(bin, true))
        .attr('stroke', strokeColor(bin, true))
        .attr('stroke-width', strokeWidth(bin, true));
    };

    const bars = g
      .selectAll('rect.hist-bar')
      .data(bins)
      .enter()
      .append('rect')
      .attr('class', 'hist-bar')
      .attr('x', (b) => baseX(b))
      .attr('y', (b) => baseY(b))
      .attr('width', (b) => baseWidth(b))
      .attr('height', (b) => baseHeight(b))
      .attr('fill', (b) => fillColor(b, false))
      .attr('opacity', (b) => opacityValue(b, false))
      .attr('stroke', (b) => strokeColor(b, false))
      .attr('stroke-width', (b) => strokeWidth(b, false))
      .style('pointer-events', 'none');

    g.selectAll('rect.hist-hit-area')
      .data(bins)
      .enter()
      .append('rect')
      .attr('class', 'hist-hit-area')
      .attr('x', (b) => x(b.x0))
      .attr('y', 0)
      .attr('width', (b) => Math.max(12, x(b.x1) - x(b.x0)))
      .attr('height', chartH)
      .attr('fill', 'transparent')
      .style('cursor', opts.onBarClick ? 'pointer' : 'default')
      .on('mouseenter', function (_, bin) {
        const bar = bars.filter((candidate) => candidate === bin);
        applyHoverState(bar, bin);
      })
      .on('mouseleave', function (_, bin) {
        const bar = bars.filter((candidate) => candidate === bin);
        applyBaseState(bar, bin);
      })
      .on('click', function (_, bin) {
        opts.onBarClick?.(bin);
      });

    g.append('g')
      .attr('transform', `translate(0,${chartH})`)
      .call(
        d3.axisBottom(x).ticks(5).tickFormat(opts.xFormat || ((value) => `$${Math.round(value / 1000)}k`)),
      )
      .style('color', colors.textMuted)
      .style('font-size', '10px');
    g.append('g')
      .call(d3.axisLeft(y).ticks(3).tickFormat(d3.format('~s')))
      .style('color', colors.textMuted)
      .style('font-size', '10px');
  };

  const renderSidebarPrice = (properties, opts = {}) => {
    const values = properties
      .map((property) => property.predicted_value)
      .filter((value) => Number.isFinite(value) && value > 0 && value < 2000000);
    renderMiniHistogram('priceDistributionChart', histogram(values, 20, [0, 1000000]), {
      color: colors.predicted,
      hoverColor: colors.predictedHover,
      activeColor: colors.predictedActive,
      xFormat: (value) => `$${Math.round(value / 1000)}k`,
      onBarClick: opts.onBarClick,
      activeBin: opts.activeBin,
    });
  };

  const renderSidebarMarket = (properties, opts = {}) => {
    const values = properties
      .map((property) => property.market_value)
      .filter((value) => Number.isFinite(value) && value > 0 && value < 2000000);
    renderMiniHistogram('marketDistributionChart', histogram(values, 20, [0, 1000000]), {
      color: colors.market,
      hoverColor: colors.marketHover,
      activeColor: colors.marketActive,
      xFormat: (value) => `$${Math.round(value / 1000)}k`,
      onBarClick: opts.onBarClick,
      activeBin: opts.activeBin,
    });
  };

  const showContainerError = (containerId, message) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `<div class="flex items-center justify-center h-full text-[#ffb2b6] text-xs px-4 text-center">${message}</div>`;
  };

  return {
    init,
    renderSidebarPrice,
    renderSidebarMarket,
  };
})();
