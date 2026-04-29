/**
 * Chart Filtering Module for Tax Assessor Review Interface
 * Handles numeric filters and address search.
 */

const ChartFiltering = (() => {
  const priceMinInput = document.getElementById('priceMinInput');
  const priceMaxInput = document.getElementById('priceMaxInput');
  const priceRangeValue = document.getElementById('priceRangeValue');
  const changeMinInput = document.getElementById('changeMinInput');
  const changeMaxInput = document.getElementById('changeMaxInput');
  const changeRangeValue = document.getElementById('changeRangeValue');
  const changeFullRangeBtn = document.getElementById('changeFullRangeBtn');
  const confirmFiltersBtn = document.getElementById('confirmFiltersBtn');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const searchInput = document.getElementById('addressSearch');
  const clearSearchBtn = document.getElementById('clearAddressSearch');
  const searchResults = document.getElementById('reviewerSearchResults');
  const activeFiltersSummary = document.getElementById('activeFiltersSummary');
  const presetButtons = Array.from(
    document.querySelectorAll('.filter-preset-btn'),
  );

  let filterCallbacks = [];
  let configuredRanges = {
    predictedMin: 0,
    predictedMax: 5000000,
    changeMin: -50,
    changeMax: 50,
    defaultChangeMin: -50,
    defaultChangeMax: 50,
  };

  const init = (onFilterChange) => {
    if (onFilterChange) filterCallbacks.push(onFilterChange);

    [priceMinInput, priceMaxInput].forEach((input) => {
      if (input) input.addEventListener('input', handlePriceRangeChange);
    });

    [changeMinInput, changeMaxInput].forEach((input) => {
      if (input) input.addEventListener('input', handleChangeRangeChange);
    });

    if (confirmFiltersBtn) {
      confirmFiltersBtn.addEventListener('click', applyRangeFilters);
    }

    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener('click', handleResetFilters);
    }

    if (changeFullRangeBtn) {
      changeFullRangeBtn.addEventListener('click', applyFullChangeRange);
    }

    presetButtons.forEach((button) => {
      button.addEventListener('click', () => applyPreset(button));
    });

    setupAddressSearch();
    syncSearchUi();
    renderActiveFilters();
  };

  const handlePriceRangeChange = () => {
    const min = toNumber(priceMinInput?.value, configuredRanges.predictedMin);
    const max = toNumber(priceMaxInput?.value, configuredRanges.predictedMax);
    const [priceMin, priceMax] = min <= max ? [min, max] : [max, min];

    updatePriceLabel(priceMin, priceMax);
  };

  const handleChangeRangeChange = () => {
    const min = toNumber(changeMinInput?.value, configuredRanges.changeMin);
    const max = toNumber(changeMaxInput?.value, configuredRanges.changeMax);
    const [changeMin, changeMax] = min <= max ? [min, max] : [max, min];

    updateChangeLabel(changeMin, changeMax);
  };

  const applyRangeFilters = () => {
    const priceMinRaw = toNumber(priceMinInput?.value, configuredRanges.predictedMin);
    const priceMaxRaw = toNumber(priceMaxInput?.value, configuredRanges.predictedMax);
    const changeMinRaw = toNumber(changeMinInput?.value, configuredRanges.defaultChangeMin);
    const changeMaxRaw = toNumber(changeMaxInput?.value, configuredRanges.defaultChangeMax);

    const [priceMin, priceMax] =
      priceMinRaw <= priceMaxRaw
        ? [priceMinRaw, priceMaxRaw]
        : [priceMaxRaw, priceMinRaw];
    const [changeMin, changeMax] =
      changeMinRaw <= changeMaxRaw
        ? [changeMinRaw, changeMaxRaw]
        : [changeMaxRaw, changeMinRaw];

    if (priceMinInput) priceMinInput.value = priceMin;
    if (priceMaxInput) priceMaxInput.value = priceMax;
    if (changeMinInput) changeMinInput.value = changeMin;
    if (changeMaxInput) changeMaxInput.value = changeMax;

    updatePriceLabel(priceMin, priceMax);
    updateChangeLabel(changeMin, changeMax);
    AssessorSidebar?.clearDistributionBinFilters?.();

    triggerFilterChange({
      priceMin,
      priceMax,
      changeMin,
      changeMax,
      marketMin: null,
      marketMax: null,
    });
    fitToFilteredResults();

    PropertyPopup.showNotification(
      `Filters applied: ${Utils.formatCurrency(priceMin)} - ${Utils.formatCurrency(priceMax)}, ${changeMin}% to ${changeMax >= 0 ? '+' : ''}${changeMax}%`,
      'success',
    );
  };

  const handleResetFilters = () => {
    if (priceMinInput) priceMinInput.value = configuredRanges.predictedMin;
    if (priceMaxInput) priceMaxInput.value = configuredRanges.predictedMax;
    if (changeMinInput) changeMinInput.value = configuredRanges.defaultChangeMin;
    if (changeMaxInput) changeMaxInput.value = configuredRanges.defaultChangeMax;
    if (searchInput) searchInput.value = '';
    if (searchResults) searchResults.classList.add('hidden');

    updatePriceLabel(configuredRanges.predictedMin, configuredRanges.predictedMax);
    updateChangeLabel(configuredRanges.defaultChangeMin, configuredRanges.defaultChangeMax);
    AssessorSidebar?.clearDistributionBinFilters?.();
    clearPresetStates();
    DataManager.resetFilters();
    triggerFilterChange({});
    PropertyPopup.showNotification('Filters reset', 'info');
  };

  const applyFullChangeRange = () => {
    if (changeMinInput) changeMinInput.value = configuredRanges.changeMin;
    if (changeMaxInput) changeMaxInput.value = configuredRanges.changeMax;
    clearPresetStates('change');
    handleChangeRangeChange();
  };

  const applyPreset = (button) => {
    const type = button.dataset.presetType;
    const preset = button.dataset.preset;
    if (!type || !preset) return;

    clearPresetStates(type);
    button.classList.add('active');

    if (type === 'predicted') {
      const min = configuredRanges.predictedMin;
      const max = configuredRanges.predictedMax;
      const span = Math.max(max - min, 1);
      let nextMin = min;
      let nextMax = max;

      if (preset === 'low') {
        nextMax = min + span * 0.25;
      } else if (preset === 'mid') {
        nextMin = min + span * 0.25;
        nextMax = min + span * 0.75;
      } else if (preset === 'high') {
        nextMin = min + span * 0.75;
        nextMax = min + span * 0.9;
      } else if (preset === 'top10') {
        nextMin = min + span * 0.9;
      }

      if (priceMinInput) priceMinInput.value = Math.round(nextMin);
      if (priceMaxInput) priceMaxInput.value = Math.round(nextMax);
      handlePriceRangeChange();
      applyRangeFilters();
      return;
    }

    const changeMin = configuredRanges.changeMin;
    const changeMax = configuredRanges.changeMax;
    let nextMin = changeMin;
    let nextMax = changeMax;

    if (preset === 'drop') {
      nextMax = Math.min(-10, configuredRanges.defaultChangeMax);
    } else if (preset === 'flat') {
      nextMin = Math.max(-5, configuredRanges.defaultChangeMin);
      nextMax = Math.min(5, configuredRanges.defaultChangeMax);
    } else if (preset === 'increase') {
      nextMin = Math.max(10, configuredRanges.defaultChangeMin);
    }

    if (changeMinInput) changeMinInput.value = Math.round(nextMin);
    if (changeMaxInput) changeMaxInput.value = Math.round(nextMax);
    handleChangeRangeChange();
    applyRangeFilters();
  };

  const setupAddressSearch = () => {
    if (!searchInput) return;

    searchInput.addEventListener('input', Utils.debounce(() => {
      const term = searchInput.value.trim();
      syncSearchUi();
      triggerFilterChange({ searchTerm: term });
      renderSearchResults(term);
    }, 250));

    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        const first = DataManager.searchCandidates(searchInput.value.trim(), 1)[0];
        if (first) selectSearchResult(first);
      }
    });

    document.addEventListener('click', (event) => {
      if (!searchResults || !searchInput) return;
      if (!searchResults.contains(event.target) && !searchInput.contains(event.target)) {
        searchResults.classList.add('hidden');
      }
    });

    clearSearchBtn?.addEventListener('click', clearSearchAndSelection);
  };

  const renderSearchResults = (term) => {
    if (!searchResults) return;

    if (!term) {
      searchResults.classList.add('hidden');
      searchResults.innerHTML = '';
      return;
    }

    const results = DataManager.searchCandidates(term, 8);
    if (!results.length) {
      searchResults.classList.add('hidden');
      return;
    }

    searchResults.innerHTML = results
      .map(
        (property) => `
          <button type="button" class="w-full text-left px-3 py-2 border-b border-[#e2e2e2]/10 hover:bg-[#121414] transition-colors" data-id="${property.id}">
            <div class="text-sm font-600">${property.address}</div>
            <div class="text-xs text-[#e2e2e2]/40 mt-1">OPA ${property.id} · ${Utils.formatCurrency(property.tax_year_value)}</div>
          </button>
        `,
      )
      .join('');
    searchResults.classList.remove('hidden');

    searchResults.querySelectorAll('[data-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const property = DataManager.getPropertyById(button.dataset.id);
        if (property) selectSearchResult(property);
      });
    });
  };

  const selectSearchResult = (property) => {
    if (searchInput) searchInput.value = property.address;
    if (searchResults) searchResults.classList.add('hidden');
    syncSearchUi();

    triggerFilterChange({ searchTerm: property.address });
    if (typeof MapInteraction !== 'undefined') {
      MapInteraction.flyToProperty([property.lng, property.lat]);
      MapInteraction.highlightProperty(property.id);
      MapInteraction.showMarker?.(property);
    }
    if (typeof AssessorSidebar !== 'undefined') {
      AssessorSidebar.showProperty(property);
    }
  };

  const clearSearchAndSelection = () => {
    if (searchInput) searchInput.value = '';
    if (searchResults) {
      searchResults.classList.add('hidden');
      searchResults.innerHTML = '';
    }
    syncSearchUi();
    triggerFilterChange({ searchTerm: '' });
    AssessorSidebar?.clearSelection?.();
  };

  const syncSearchUi = () => {
    if (!clearSearchBtn || !searchInput) return;
    const hasValue = Boolean(searchInput.value.trim());
    clearSearchBtn.classList.toggle('hidden', !hasValue);
    clearSearchBtn.classList.toggle('inline-flex', hasValue);
  };

  const triggerFilterChange = (newFilters) => {
    DataManager.setFilters(newFilters);
    renderActiveFilters();
    filterCallbacks.forEach((callback) => {
      if (typeof callback === 'function') {
        callback(DataManager.getFilteredProperties());
      }
    });
  };

  const onFilterChange = (callback) => {
    filterCallbacks.push(callback);
  };

  const updateSliderDisplay = (data) => {
    if (data.priceMin !== undefined || data.priceMax !== undefined) {
      if (priceMinInput && data.priceMin !== undefined) priceMinInput.value = Math.round(data.priceMin);
      if (priceMaxInput && data.priceMax !== undefined) priceMaxInput.value = Math.round(data.priceMax);
      updatePriceLabel(
        data.priceMin ?? configuredRanges.predictedMin,
        data.priceMax ?? configuredRanges.predictedMax,
      );
    }
    if (data.changeMin !== undefined || data.changeMax !== undefined) {
      if (changeMinInput && data.changeMin !== undefined) changeMinInput.value = Math.round(data.changeMin);
      if (changeMaxInput && data.changeMax !== undefined) changeMaxInput.value = Math.round(data.changeMax);
      updateChangeLabel(
        data.changeMin ?? configuredRanges.defaultChangeMin,
        data.changeMax ?? configuredRanges.defaultChangeMax,
      );
    }
  };

  const configureRanges = (ranges = {}) => {
    configuredRanges = {
      ...configuredRanges,
      ...ranges,
    };

    configuredRanges.defaultChangeMin = configuredRanges.changeMin;
    configuredRanges.defaultChangeMax = Math.min(configuredRanges.changeMax, 200);

    if (priceMinInput) {
      priceMinInput.value = configuredRanges.predictedMin;
      priceMinInput.min = configuredRanges.predictedMin;
      priceMinInput.max = configuredRanges.predictedMax;
    }
    if (priceMaxInput) {
      priceMaxInput.value = configuredRanges.predictedMax;
      priceMaxInput.min = configuredRanges.predictedMin;
      priceMaxInput.max = configuredRanges.predictedMax;
    }
    if (changeMinInput) {
      changeMinInput.value = configuredRanges.defaultChangeMin;
      changeMinInput.min = configuredRanges.changeMin;
      changeMinInput.max = configuredRanges.changeMax;
    }
    if (changeMaxInput) {
      changeMaxInput.value = configuredRanges.defaultChangeMax;
      changeMaxInput.min = configuredRanges.changeMin;
      changeMaxInput.max = configuredRanges.changeMax;
    }

    updatePriceLabel(configuredRanges.predictedMin, configuredRanges.predictedMax);
    updateChangeLabel(configuredRanges.defaultChangeMin, configuredRanges.defaultChangeMax);
    renderActiveFilters();
  };

  const updatePriceLabel = (min, max) => {
    if (priceRangeValue) {
      priceRangeValue.textContent = `${Utils.formatCurrency(min)} - ${Utils.formatCurrency(max)}`;
    }
  };

  const updateChangeLabel = (min, max) => {
    if (changeRangeValue) {
      changeRangeValue.textContent = `${min}% to ${max >= 0 ? '+' : ''}${max}%`;
    }
  };

  const renderActiveFilters = () => {
    if (!activeFiltersSummary) return;

    const filters = DataManager.getFilters?.() || {};
    const chips = [];
    if (
      Number.isFinite(filters.priceMin) &&
      Number.isFinite(filters.priceMax) &&
      (Math.round(filters.priceMin) !== Math.round(configuredRanges.predictedMin) ||
        Math.round(filters.priceMax) !== Math.round(configuredRanges.predictedMax))
    ) {
      chips.push({
        key: 'predicted',
        label: `Predicted: ${Utils.formatCurrency(filters.priceMin)} - ${Utils.formatCurrency(filters.priceMax)}`,
      });
    }

    if (
      Number.isFinite(filters.changeMin) &&
      Number.isFinite(filters.changeMax) &&
      (Math.round(filters.changeMin) !== Math.round(configuredRanges.defaultChangeMin) ||
        Math.round(filters.changeMax) !== Math.round(configuredRanges.defaultChangeMax))
    ) {
      chips.push({
        key: 'change',
        label: `Change: ${filters.changeMin}% to ${filters.changeMax >= 0 ? '+' : ''}${filters.changeMax}%`,
      });
    }

    if (Number.isFinite(filters.marketMin) && Number.isFinite(filters.marketMax)) {
      chips.push({
        key: 'market',
        label: `Market: ${Utils.formatCurrency(filters.marketMin)} - ${Utils.formatCurrency(filters.marketMax)}`,
      });
    }

    if (!chips.length) {
      activeFiltersSummary.innerHTML =
        '<span class="text-[#e2e2e2]/40 text-xs">No active filters</span>';
      return;
    }

    activeFiltersSummary.innerHTML = chips
      .map(
        (chip) => `
          <span class="active-filter-chip">
            <span>${chip.label}</span>
            <button type="button" data-filter-key="${chip.key}" aria-label="Clear ${chip.key} filter">&times;</button>
          </span>
        `,
      )
      .join('');

    activeFiltersSummary.querySelectorAll('[data-filter-key]').forEach((button) => {
      button.addEventListener('click', () => clearFilter(button.dataset.filterKey));
    });
  };

  const clearFilter = (key) => {
    if (key === 'predicted') {
      if (priceMinInput) priceMinInput.value = configuredRanges.predictedMin;
      if (priceMaxInput) priceMaxInput.value = configuredRanges.predictedMax;
      clearPresetStates('predicted');
      handlePriceRangeChange();
    } else if (key === 'change') {
      if (changeMinInput) changeMinInput.value = configuredRanges.defaultChangeMin;
      if (changeMaxInput) changeMaxInput.value = configuredRanges.defaultChangeMax;
      clearPresetStates('change');
      handleChangeRangeChange();
    } else if (key === 'market') {
      DataManager.clearRangeDrilldown?.();
      AssessorSidebar?.clearDistributionBinFilters?.();
    }

    applyRangeFilters();
  };

  const clearPresetStates = (type = null) => {
    presetButtons.forEach((button) => {
      if (!type || button.dataset.presetType === type) {
        button.classList.remove('active');
      }
    });
  };

  const fitToFilteredResults = () => {
    MapInteraction.fitToBounds?.();
  };

  const syncUiFromFilters = () => {
    const filters = DataManager.getFilters?.() || {};
    if (Number.isFinite(filters.priceMin) || Number.isFinite(filters.priceMax)) {
      updatePriceLabel(
        filters.priceMin ?? configuredRanges.predictedMin,
        filters.priceMax ?? configuredRanges.predictedMax,
      );
    }
    if (Number.isFinite(filters.changeMin) || Number.isFinite(filters.changeMax)) {
      updateChangeLabel(
        filters.changeMin ?? configuredRanges.defaultChangeMin,
        filters.changeMax ?? configuredRanges.defaultChangeMax,
      );
    }
    syncSearchUi();
    renderActiveFilters();
  };

  const toNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const getFilters = () => DataManager.getFilters();

  return {
    init,
    onFilterChange,
    getFilters,
    updateSliderDisplay,
    configureRanges,
    handleResetFilters,
    applyRangeFilters,
    syncUiFromFilters,
    clearSearchAndSelection,
  };
})();
