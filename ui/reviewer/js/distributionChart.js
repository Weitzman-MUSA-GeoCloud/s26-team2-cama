/**
 * Distribution Chart Module using D3.js
 * Loads and visualizes assessment distribution data from GCS
 */

const DistributionChart = (() => {
  // GCS URLs for distribution data
  const TAX_YEAR_DATA_URL = 'https://storage.googleapis.com/musa5090s26-team2-public/configs/tax_year_assessment_bins.json';
  const CURRENT_DATA_URL = 'https://storage.googleapis.com/musa5090s26-team2-public/configs/current_assessment_bins.json';

  // Color palette matching the design system
  const colors = {
    blue: '#a0caff',
    red: '#ffb2b6',
    grid: 'rgba(226, 226, 226, 0.1)',
    text: '#e2e2e2',
    textMuted: '#8b949e',
    bg: '#121414',
  };

  // Tax year colors (for multiple lines)
  const taxYearColors = ['#a0caff', '#58a6ff', '#79c0ff', '#c9d1d9', '#ffb2b6'];

  // State management for legend toggle
  const visibleTaxYears = new Set();
  let cachedTaxYearData = null;
  let cachedCurrentData = null;
  let latestTaxYears = [];

  /**
   * Initialize both distribution charts
   */
  const init = async () => {
    try {
      console.log('📊 Initializing distribution charts...');

      // Load both datasets in parallel
      const [taxYearData, currentData] = await Promise.all([
        fetch(TAX_YEAR_DATA_URL).then(r => r.json()),
        fetch(CURRENT_DATA_URL).then(r => r.json()),
      ]);

      console.log('✓ Tax year data loaded:', taxYearData.length, 'bins');
      console.log('✓ Current data loaded:', currentData.length, 'bins');

      // Cache data for responsive re-rendering
      cachedTaxYearData = taxYearData;
      cachedCurrentData = currentData;
      latestTaxYears = getLatestYears(taxYearData, 2);

      // Render both charts independently so one chart cannot take down both.
      try {
        renderTaxYearChart(taxYearData);
      } catch (chartError) {
        console.error('Tax year chart render failed:', chartError);
        showContainerError('bottomLeftChart', `Failed to render: ${chartError.message}`);
      }

      try {
        renderCurrentChart(currentData);
      } catch (chartError) {
        console.error('Current chart render failed:', chartError);
        showContainerError('bottomRightChart', `Failed to render: ${chartError.message}`);
      }
      setupChartModal();

      // Add responsive resize listener with debounce
      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          console.log('🔄 Re-rendering charts due to resize...');
          renderTaxYearChart(cachedTaxYearData);
          renderCurrentChart(cachedCurrentData);
        }, 250);
      });

      console.log('✓ Distribution charts rendered');
      console.log('💡 Tip: Hover over data points to see values, click legend items to toggle visibility');
    } catch (error) {
      console.error('❌ Error loading distribution data:', error);
      showError('Failed to load distribution charts');
    }
  };

  /**
   * Render tax year assessment bins chart (multiple lines, one per tax year)
   */
  const renderTaxYearChart = (data) => {
    const container = document.getElementById('bottomLeftChart');
    if (!container) {
      console.warn('Tax year chart container not found');
      return;
    }

    container.innerHTML = '';
    renderTaxYearBarChart(container, data);
    return;

    // Clear container
    container.innerHTML = '';

    // Dimensions
    const width = container.clientWidth - 8;
    const height = container.clientHeight - 44;

    // Group data by tax_year
    const groupedData = {};
    data.forEach(d => {
      if (!groupedData[d.tax_year]) {
        groupedData[d.tax_year] = [];
      }
      groupedData[d.tax_year].push(d);
    });

    // Get all tax years and sort
    const taxYears = Object.keys(groupedData).sort((a, b) => Number(a) - Number(b));
    console.log('Tax years found:', taxYears);

    // Initialize visible tax years on first load. By default, show the latest
    // two years so the chart matches the assessment-review story without
    // crowding the panel.
    if (visibleTaxYears.size === 0) {
      latestTaxYears.forEach(year => visibleTaxYears.add(String(year)));
    }

    // Margins
    const margin = { top: 18, right: 24, bottom: 38, left: 72 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('style', 'background: transparent;');

    // Create group for the chart
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.upper_bound)])
      .range([0, chartWidth]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.property_count)])
      .range([chartHeight, 0]);

    // Line generator
    const line = d3.line()
      .x(d => xScale((d.lower_bound + d.upper_bound) / 2))
      .y(d => yScale(d.property_count));

    // Add grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(d3.axisLeft(yScale)
        .tickSize(-chartWidth)
        .tickFormat('')
      )
      .style('stroke', colors.grid);

    // Create tooltip element
    const tooltip = d3.select('body').append('div')
      .attr('class', 'chart-tooltip')
      .style('position', 'absolute')
      .style('background-color', '#1e2020')
      .style('color', '#e2e2e2')
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('border', '1px solid #e2e2e2/20')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', '1000');

    // Draw line for each tax year
    taxYears.forEach((year, index) => {
      const yearData = groupedData[year];
      const color = taxYearColors[index % taxYearColors.length];
      const isVisible = visibleTaxYears.has(year);

      g.append('path')
        .attr('class', `path-${year}`)
        .datum(yearData)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('d', line)
        .attr('opacity', isVisible ? 0.8 : 0.2)
        .style('pointer-events', isVisible ? 'auto' : 'none')
        .style('transition', 'opacity 0.3s ease');

      // Add dots at data points with hover interaction
      g.selectAll(`.dot-${year}`)
        .data(yearData)
        .enter()
        .append('circle')
        .attr('class', `dot-${year}`)
        .attr('cx', d => xScale((d.lower_bound + d.upper_bound) / 2))
        .attr('cy', d => yScale(d.property_count))
        .attr('r', 3)
        .attr('fill', color)
        .attr('opacity', isVisible ? 0.6 : 0.1)
        .style('cursor', 'pointer')
        .style('transition', 'opacity 0.3s ease')
        .on('mouseover', function(event, d) {
          if (isVisible) {
            d3.select(this)
              .attr('r', 6)
              .attr('opacity', 1);

            const priceRange = `$${(d.lower_bound / 1000).toFixed(0)}k - $${(d.upper_bound / 1000).toFixed(0)}k`;
            tooltip.style('opacity', 1)
              .html(`<strong>${year}</strong><br/>
                    Range: ${priceRange}<br/>
                    Properties: ${d.property_count}`)
              .style('left', (event.pageX + 10) + 'px')
              .style('top', (event.pageY - 10) + 'px');
          }
        })
        .on('mousemove', function(event) {
          tooltip.style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', function() {
          d3.select(this)
            .attr('r', 3)
            .attr('opacity', isVisible ? 0.6 : 0.1);
          tooltip.style('opacity', 0);
        });
    });

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickFormat(d => `$${(d / 1000).toFixed(0)}k`);

    const yAxis = d3.axisLeft(yScale)
      .ticks(4)
      .tickFormat(d3.format('~s'));

    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis)
      .style('color', colors.textMuted)
      .style('font-size', '10px');

    g.append('g')
      .call(yAxis)
      .style('color', colors.textMuted)
      .style('font-size', '10px');

    g.selectAll('.tick text')
      .attr('dx', '-0.15em');

    // Add legend with toggle functionality
    const legend = svg.append('g')
      .attr('transform', `translate(${margin.left + 10}, 5)`);

    const legendYears = taxYears.filter((year) => visibleTaxYears.has(year));
    legendYears.forEach((year, index) => {
      const color = taxYearColors[index % taxYearColors.length];
      const x = index * 120;
      const isVisible = visibleTaxYears.has(year);

      const legendGroup = legend.append('g')
        .attr('class', `legend-${year}`)
        .style('cursor', 'pointer')
        .on('click', () => {
          toggleYear(year);
        });

      legendGroup.append('rect')
        .attr('x', x)
        .attr('y', 0)
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', color)
        .attr('opacity', isVisible ? 1 : 0.3)
        .style('stroke', isVisible ? color : 'none')
        .style('stroke-width', '2px');

      legendGroup.append('text')
        .attr('x', x + 18)
        .attr('y', 10)
        .attr('font-size', '11px')
        .attr('fill', colors.text)
        .attr('opacity', isVisible ? 1 : 0.5)
        .text(`${year}`);
    });
  };

  /**
   * Render current assessment bins chart (single line)
   */
  const renderCurrentChart = (data) => {
    const container = document.getElementById('bottomRightChart');
    if (!container) {
      console.warn('Current chart container not found');
      return;
    }

    container.innerHTML = '';
    renderCurrentBarChart(container, data);
    return;

    // Clear container
    container.innerHTML = '';

    // Dimensions
    const width = container.clientWidth - 8;
    const height = container.clientHeight - 44;

    // Margins
    const margin = { top: 18, right: 24, bottom: 38, left: 72 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('style', 'background: transparent;');

    // Create group for the chart
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.upper_bound)])
      .range([0, chartWidth]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.property_count)])
      .range([chartHeight, 0]);

    // Line generator
    const line = d3.line()
      .x(d => xScale((d.lower_bound + d.upper_bound) / 2))
      .y(d => yScale(d.property_count));

    // Add grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(d3.axisLeft(yScale)
        .tickSize(-chartWidth)
        .tickFormat('')
      )
      .style('stroke', colors.grid);

    // Create tooltip element
    const tooltip = d3.select('body').append('div')
      .attr('class', 'chart-tooltip')
      .style('position', 'absolute')
      .style('background-color', '#1e2020')
      .style('color', '#e2e2e2')
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('border', '1px solid #e2e2e2/20')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', '1000');

    // Draw main line
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', colors.red)
      .attr('stroke-width', 2.5)
      .attr('d', line)
      .attr('opacity', 0.8);

    // Add dots at data points with hover interaction
    g.selectAll('.dot')
      .data(data)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale((d.lower_bound + d.upper_bound) / 2))
      .attr('cy', d => yScale(d.property_count))
      .attr('r', 3.5)
      .attr('fill', colors.red)
      .attr('opacity', 0.7)
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        d3.select(this)
          .attr('r', 7)
          .attr('opacity', 1);

        const priceRange = `$${(d.lower_bound / 1000).toFixed(0)}k - $${(d.upper_bound / 1000).toFixed(0)}k`;
        tooltip.style('opacity', 1)
          .html(`<strong>Predicted Value</strong><br/>
                Range: ${priceRange}<br/>
                Properties: ${d.property_count}`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mousemove', function(event) {
        tooltip.style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function() {
        d3.select(this)
          .attr('r', 3.5)
          .attr('opacity', 0.7);
        tooltip.style('opacity', 0);
      });

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickFormat(d => `$${(d / 1000).toFixed(0)}k`);

    const yAxis = d3.axisLeft(yScale)
      .ticks(4)
      .tickFormat(d3.format('~s'));

    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis)
      .style('color', colors.textMuted)
      .style('font-size', '10px');

    g.append('g')
      .call(yAxis)
      .style('color', colors.textMuted)
      .style('font-size', '10px');

    g.selectAll('.tick text')
      .attr('dx', '-0.15em');

    // Add legend
    svg.append('rect')
      .attr('x', margin.left + 10)
      .attr('y', 5)
      .attr('width', 12)
      .attr('height', 12)
      .attr('fill', colors.red);

    svg.append('text')
      .attr('x', margin.left + 28)
      .attr('y', 15)
      .attr('font-size', '11px')
      .attr('fill', colors.text)
      .text('Predicted Value');
  };

  const getLatestYears = (data, count) => {
    return [...new Set(data.map((d) => Number(d.tax_year)).filter(Number.isFinite))]
      .sort((a, b) => b - a)
      .slice(0, count)
      .sort((a, b) => a - b)
      .map(String);
  };

  function renderTaxYearBarChart(container, data) {
    const grouped = {};
    data.forEach((d) => {
      const year = String(d.tax_year);
      if (!grouped[year]) grouped[year] = [];
      grouped[year].push(d);
    });
    const taxYears = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));
    if (visibleTaxYears.size === 0) {
      latestTaxYears.forEach((year) => visibleTaxYears.add(String(year)));
    }
    const visibleYears = taxYears.filter((year) => visibleTaxYears.has(year));
    const series = visibleYears.map((year, i) => ({
      name: year,
      color: taxYearColors[i % taxYearColors.length],
      values: grouped[year].map((d) => ({
        x0: d.lower_bound,
        x1: d.upper_bound,
        y: d.property_count,
      })),
    }));
    renderGroupedBars(container, series, { compact: true, legendMode: 'visible-only' });
  }

  function renderCurrentBarChart(container, data) {
    renderGroupedBars(
      container,
      [
        {
          name: 'Predicted Value',
          color: colors.red,
          values: data.map((d) => ({
            x0: d.lower_bound,
            x1: d.upper_bound,
            y: d.property_count,
          })),
        },
      ],
      { compact: true }
    );
  }

  function renderGroupedBars(container, series, opts = {}) {
    if (!series.length) {
      container.innerHTML = '<div class="text-sm text-[#e2e2e2]/50">No data</div>';
      return;
    }

    const width = Math.max(container.clientWidth || 500, 260);
    const height = Math.max(container.clientHeight || 180, 140);
    const margin = opts.compact
      ? { top: 22, right: 18, bottom: 34, left: 58 }
      : { top: 34, right: 32, bottom: 58, left: 82 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const allValues = series.flatMap((s) => s.values);
    const x = d3
      .scaleLinear()
      .domain([d3.min(allValues, (d) => d.x0) || 0, d3.max(allValues, (d) => d.x1) || 1])
      .range([0, chartWidth]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(allValues, (d) => d.y) || 1])
      .nice()
      .range([chartHeight, 0]);

    const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const barGroup = g.append('g');
    const seriesCount = Math.max(series.length, 1);
    series.forEach((s, seriesIndex) => {
      const seriesClass = `series-${cssSafe(s.name)}`;
      barGroup
        .selectAll(`rect.${seriesClass}`)
        .data(s.values)
        .enter()
        .append('rect')
        .attr('class', seriesClass)
        .attr('x', (d) => {
          const full = Math.max(1, x(d.x1) - x(d.x0));
          return x(d.x0) + (full / seriesCount) * seriesIndex + 1;
        })
        .attr('y', (d) => y(d.y))
        .attr('width', (d) => {
          const full = Math.max(1, x(d.x1) - x(d.x0));
          return Math.max(1, full / seriesCount - 2);
        })
        .attr('height', (d) => chartHeight - y(d.y))
        .attr('fill', s.color)
        .attr('opacity', series.length > 1 ? 0.74 : 0.82);
    });

    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x).ticks(opts.compact ? 5 : 8).tickFormat((d) => `$${(d / 1000).toFixed(0)}k`))
      .style('color', colors.textMuted)
      .style('font-size', opts.compact ? '10px' : '12px');
    g.append('g')
      .call(d3.axisLeft(y).ticks(opts.compact ? 4 : 6).tickFormat(d3.format('~s')))
      .style('color', colors.textMuted)
      .style('font-size', opts.compact ? '10px' : '12px');

    const legendItems =
      opts.legendMode === 'visible-only'
        ? series.map((s) => s.name)
        : series.map((s) => s.name);
    const legend = svg.append('g').attr('transform', `translate(${margin.left}, ${opts.compact ? 4 : 10})`);
    legendItems.forEach((name, i) => {
      const s = series.find((item) => item.name === name);
      const item = legend.append('g').attr('transform', `translate(${i * 140}, 0)`);
      item.append('rect').attr('width', 12).attr('height', 12).attr('fill', s?.color || colors.blue);
      item.append('text').attr('x', 18).attr('y', 11).attr('fill', colors.text).attr('font-size', opts.compact ? 11 : 12).text(name);
    });
  }

  function cssSafe(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  const toggleYear = (year) => {
    if (visibleTaxYears.has(year)) {
      if (visibleTaxYears.size > 1) visibleTaxYears.delete(year);
    } else {
      visibleTaxYears.add(year);
    }
    renderTaxYearChart(cachedTaxYearData);
    const modal = document.getElementById('chartModal');
    if (modal && !modal.classList.contains('hidden')) {
      const body = document.getElementById('chartModalBody');
      const title = document.getElementById('chartModalTitle')?.textContent || '';
      if (body && title === 'Market Value Distribution') {
        body.innerHTML = '';
        renderZoomableTaxYearChart(body, cachedTaxYearData || []);
      }
    }
  };

  const setupChartModal = () => {
    const modal = document.getElementById('chartModal');
    const closeBtn = document.getElementById('closeChartModalBtn');
    if (!modal || modal.dataset.bound === 'true') return;
    modal.dataset.bound = 'true';

    document.querySelectorAll('.chart-expand-card').forEach((card) => {
      card.addEventListener('click', () => openChartModal(card.dataset.chart));
    });

    closeBtn?.addEventListener('click', closeChartModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeChartModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeChartModal();
    });
  };

  const openChartModal = (chartType) => {
    const modal = document.getElementById('chartModal');
    const title = document.getElementById('chartModalTitle');
    const body = document.getElementById('chartModalBody');
    if (!modal || !body || !title) return;

    body.innerHTML = '';
    modal.classList.remove('hidden');

    if (chartType === 'tax') {
      title.textContent = 'Market Value Distribution';
      renderZoomableTaxYearChart(body, cachedTaxYearData || []);
    } else {
      title.textContent = 'Predicted Value Distribution';
      renderZoomableCurrentChart(body, cachedCurrentData || []);
    }
  };

  const closeChartModal = () => {
    document.getElementById('chartModal')?.classList.add('hidden');
    const body = document.getElementById('chartModalBody');
    if (body) body.innerHTML = '';
  };

  const renderZoomableTaxYearChart = (container, data) => {
    const groupedData = {};
    data.forEach((d) => {
      if (!visibleTaxYears.has(String(d.tax_year))) return;
      if (!groupedData[d.tax_year]) groupedData[d.tax_year] = [];
      groupedData[d.tax_year].push(d);
    });
    const series = Object.keys(groupedData).sort((a, b) => Number(a) - Number(b));
    renderZoomableBarChart(container, series.map((year, i) => ({
      name: year,
      color: taxYearColors[i % taxYearColors.length],
      values: groupedData[year].map((d) => ({
        x0: d.lower_bound,
        x1: d.upper_bound,
        y: d.property_count,
      })),
    })));
  };

  const renderZoomableCurrentChart = (container, data) => {
    renderZoomableBarChart(container, [
      {
        name: 'Predicted Value',
        color: colors.red,
        values: data.map((d) => ({
          x0: d.lower_bound,
          x1: d.upper_bound,
          y: d.property_count,
        })),
      },
    ]);
  };

  const renderZoomableBarChart = (container, series) => {
    if (!series.length) {
      container.innerHTML = '<div class="text-sm text-[#e2e2e2]/50">No data</div>';
      return;
    }

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 520;
    const margin = { top: 34, right: 36, bottom: 58, left: 82 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const allValues = series.flatMap((s) => s.values);
    const baseX = d3
      .scaleLinear()
      .domain([d3.min(allValues, (d) => d.x0) || 0, d3.max(allValues, (d) => d.x1) || 1])
      .range([0, chartWidth]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(allValues, (d) => d.y) || 1])
      .nice()
      .range([chartHeight, 0]);

    let currentX = baseX;

    const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const clipId = `clip-bars-${Date.now()}`;
    svg
      .append('defs')
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('width', chartWidth)
      .attr('height', chartHeight);

    const plot = g.append('g').attr('clip-path', `url(#${clipId})`);
    const xAxisGroup = g.append('g').attr('transform', `translate(0,${chartHeight})`);
    const yAxisGroup = g.append('g');

    const draw = () => {
      plot.selectAll('*').remove();
      const seriesCount = Math.max(series.length, 1);
      series.forEach((s, seriesIndex) => {
        const seriesClass = `series-${cssSafe(s.name)}`;
        plot
          .selectAll(`rect.${seriesClass}`)
          .data(s.values)
          .enter()
          .append('rect')
          .attr('class', seriesClass)
          .attr('x', (d) => {
            const full = Math.max(1, currentX(d.x1) - currentX(d.x0));
            return currentX(d.x0) + (full / seriesCount) * seriesIndex + 1;
          })
          .attr('y', (d) => y(d.y))
          .attr('width', (d) => {
            const full = Math.max(1, currentX(d.x1) - currentX(d.x0));
            return Math.max(1, full / seriesCount - 2);
          })
          .attr('height', (d) => chartHeight - y(d.y))
          .attr('fill', s.color)
          .attr('opacity', series.length > 1 ? 0.74 : 0.84);
      });

      xAxisGroup
        .call(d3.axisBottom(currentX).ticks(8).tickFormat((d) => `$${(d / 1000).toFixed(0)}k`))
        .style('color', colors.textMuted)
        .style('font-size', '12px');
      yAxisGroup
        .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format('~s')))
        .style('color', colors.textMuted)
        .style('font-size', '12px');
    };

    const allLegendYears =
      cachedTaxYearData && series.some((s) => /^\d{4}$/.test(s.name))
        ? [...new Set(cachedTaxYearData.map((d) => String(d.tax_year)))]
            .sort((a, b) => Number(b) - Number(a))
            .slice(0, 6)
            .sort((a, b) => Number(a) - Number(b))
        : series.map((s) => s.name);
    const legend = svg.append('g').attr('transform', `translate(${margin.left}, 10)`);
    allLegendYears.forEach((name, i) => {
      const active = series.some((s) => s.name === name);
      const s = series.find((item) => item.name === name);
      const item = legend
        .append('g')
        .attr('transform', `translate(${i * 150}, 0)`)
        .style('cursor', /^\d{4}$/.test(name) ? 'pointer' : 'default')
        .on('click', () => {
          if (/^\d{4}$/.test(name)) toggleYear(name);
        });
      item.append('rect').attr('width', 12).attr('height', 12).attr('fill', s?.color || taxYearColors[i % taxYearColors.length]).attr('opacity', active ? 1 : 0.25);
      item.append('text').attr('x', 18).attr('y', 11).attr('fill', colors.text).attr('opacity', active ? 1 : 0.45).attr('font-size', 12).text(name);
    });

    const zoom = d3
      .zoom()
      .scaleExtent([1, 16])
      .translateExtent([
        [0, 0],
        [chartWidth, chartHeight],
      ])
      .extent([
        [0, 0],
        [chartWidth, chartHeight],
      ])
      .on('zoom', (event) => {
        currentX = event.transform.rescaleX(baseX);
        draw();
      });

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
        svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity);
      });

    draw();
  };

  const renderZoomableLineChart = (container, series) => {
    if (!series.length) {
      container.innerHTML = '<div class="text-sm text-[#e2e2e2]/50">No data</div>';
      return;
    }

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 520;
    const margin = { top: 28, right: 36, bottom: 54, left: 78 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const allValues = series.flatMap((s) => s.values);
    const baseX = d3
      .scaleLinear()
      .domain(d3.extent(allValues, (d) => d.x))
      .nice()
      .range([0, chartWidth]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(allValues, (d) => d.y) || 1])
      .nice()
      .range([chartHeight, 0]);

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const clipId = `clip-${Date.now()}`;
    svg
      .append('defs')
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('width', chartWidth)
      .attr('height', chartHeight);

    const plot = g.append('g').attr('clip-path', `url(#${clipId})`);
    const xAxisGroup = g.append('g').attr('transform', `translate(0,${chartHeight})`);
    const yAxisGroup = g.append('g');

    let currentX = baseX;
    const line = d3
      .line()
      .x((d) => currentX(d.x))
      .y((d) => y(d.y));

    const draw = () => {
      xAxisGroup
        .call(d3.axisBottom(currentX).ticks(8).tickFormat((d) => `$${(d / 1000).toFixed(0)}k`))
        .style('color', colors.textMuted)
        .style('font-size', '12px');
      yAxisGroup
        .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format('~s')))
        .style('color', colors.textMuted)
        .style('font-size', '12px');

      const paths = plot.selectAll('path.series-line').data(series, (d) => d.name);
      paths
        .enter()
        .append('path')
        .attr('class', 'series-line')
        .attr('fill', 'none')
        .attr('stroke-width', 2.5)
        .merge(paths)
        .attr('stroke', (d) => d.color)
        .attr('d', (d) => line(d.values));
      paths.exit().remove();
    };

    const allTaxYears =
      cachedTaxYearData && series.some((s) => /^\d{4}$/.test(s.name))
        ? [...new Set(cachedTaxYearData.map((d) => String(d.tax_year)))]
            .sort((a, b) => Number(b) - Number(a))
            .slice(0, 6)
            .sort((a, b) => Number(a) - Number(b))
        : series.map((s) => s.name);
    const legend = svg.append('g').attr('transform', `translate(${margin.left}, 8)`);
    allTaxYears.forEach((year, i) => {
      const active = series.some((s) => s.name === year);
      const seriesItem = series.find((s) => s.name === year);
      const color = seriesItem?.color || taxYearColors[i % taxYearColors.length];
      const item = legend
        .append('g')
        .attr('transform', `translate(${i * 150}, 0)`)
        .style('cursor', /^\d{4}$/.test(year) ? 'pointer' : 'default')
        .on('click', () => {
          if (/^\d{4}$/.test(year)) toggleYear(year);
        });
      item
        .append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', color)
        .attr('opacity', active ? 1 : 0.25);
      item
        .append('text')
        .attr('x', 18)
        .attr('y', 11)
        .attr('fill', colors.text)
        .attr('opacity', active ? 1 : 0.45)
        .attr('font-size', 12)
        .text(year);
    });

    const zoom = d3
      .zoom()
      .scaleExtent([1, 16])
      .translateExtent([
        [0, 0],
        [chartWidth, chartHeight],
      ])
      .extent([
        [0, 0],
        [chartWidth, chartHeight],
      ])
      .on('zoom', (event) => {
        currentX = event.transform.rescaleX(baseX);
        draw();
      });

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
        svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity);
      });

    draw();
  };

  /**
   * Show error message in chart container
   */
  const showError = (message) => {
    const containers = [
      document.getElementById('bottomLeftChart'),
      document.getElementById('bottomRightChart'),
    ];

    containers.forEach(container => {
      if (container) {
        container.innerHTML = `<div class="flex items-center justify-center h-full text-[#ffb2b6] text-sm">${message}</div>`;
      }
    });
  };

  const showContainerError = (containerId, message) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `<div class="flex items-center justify-center h-full text-[#ffb2b6] text-xs px-4 text-center">${message}</div>`;
  };

  /**
   * Build a histogram of numeric values with fixed bin count
   */
  const histogram = (values, binCount, domain) => {
    if (!values.length) return [];
    const [min, max] = domain || [d3.min(values), d3.max(values)];
    if (min === max) return [{ x0: min, x1: max, count: values.length }];
    const step = (max - min) / binCount;
    const bins = Array.from({ length: binCount }, (_, i) => ({
      x0: min + i * step,
      x1: min + (i + 1) * step,
      count: 0,
    }));
    values.forEach((v) => {
      if (v < min || v > max) return;
      let idx = Math.floor((v - min) / step);
      if (idx >= binCount) idx = binCount - 1;
      bins[idx].count++;
    });
    return bins;
  };

  /**
   * Render a compact histogram into a sidebar container
   */
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

    g.selectAll('rect')
      .data(bins)
      .enter()
      .append('rect')
      .attr('x', (b) => x(b.x0) + 1)
      .attr('y', (b) => y(b.count))
      .attr('width', (b) => Math.max(0, x(b.x1) - x(b.x0) - 2))
      .attr('height', (b) => chartH - y(b.count))
      .attr('fill', opts.color || colors.blue)
      .attr('opacity', 0.85);

    const xAxis = d3
      .axisBottom(x)
      .ticks(4)
      .tickFormat(opts.xFormat || ((d) => d));
    const yAxis = d3.axisLeft(y).ticks(3).tickFormat(d3.format('~s'));

    g.append('g')
      .attr('transform', `translate(0,${chartH})`)
      .call(xAxis)
      .style('color', colors.textMuted)
      .style('font-size', '10px');
    g.append('g')
      .call(yAxis)
      .style('color', colors.textMuted)
      .style('font-size', '10px');
  };

  /**
   * Render sidebar price-distribution histogram from filtered properties
   */
  const renderSidebarPrice = (properties) => {
    const values = properties
      .map((p) => p.tax_year_value)
      .filter((v) => Number.isFinite(v) && v > 0 && v < 2000000);
    const bins = histogram(values, 20, [0, 1000000]);
    renderMiniHistogram('priceDistributionChart', bins, {
      color: colors.blue,
      xFormat: (d) => `$${(d / 1000).toFixed(0)}k`,
    });
  };

  /**
   * Render sidebar change-distribution histogram from filtered properties
   */
  const renderSidebarChange = (properties) => {
    const values = properties
      .map((p) => p.change_percent)
      .filter((v) => Number.isFinite(v) && v >= -50 && v <= 50);
    const bins = histogram(values, 20, [-50, 50]);
    renderMiniHistogram('changeDistributionChart', bins, {
      color: colors.red,
      xFormat: (d) => `${d.toFixed(0)}%`,
    });
  };

  // Public API
  return {
    init,
    renderSidebarPrice,
    renderSidebarChange,
  };
})();
