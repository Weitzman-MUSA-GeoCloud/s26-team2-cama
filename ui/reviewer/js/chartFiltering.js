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
  const confirmFiltersBtn = document.getElementById('confirmFiltersBtn');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const searchInput = document.getElementById('addressSearch');
  const searchResults = document.getElementById('reviewerSearchResults');

  let filterCallbacks = [];

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

    setupAddressSearch();
  };

  const handlePriceRangeChange = () => {
    const min = toNumber(priceMinInput?.value, 0);
    const max = toNumber(priceMaxInput?.value, 5000000);
    const [priceMin, priceMax] = min <= max ? [min, max] : [max, min];

    updatePriceLabel(priceMin, priceMax);
  };

  const handleChangeRangeChange = () => {
    const min = toNumber(changeMinInput?.value, -50);
    const max = toNumber(changeMaxInput?.value, 50);
    const [changeMin, changeMax] = min <= max ? [min, max] : [max, min];

    updateChangeLabel(changeMin, changeMax);
  };

  const applyRangeFilters = () => {
    const priceMinRaw = toNumber(priceMinInput?.value, 0);
    const priceMaxRaw = toNumber(priceMaxInput?.value, 5000000);
    const changeMinRaw = toNumber(changeMinInput?.value, -50);
    const changeMaxRaw = toNumber(changeMaxInput?.value, 50);

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

    triggerFilterChange({
      priceMin,
      priceMax,
      changeMin,
      changeMax,
    });

    PropertyPopup.showNotification(
      `Filters applied: ${Utils.formatCurrency(priceMin)} - ${Utils.formatCurrency(priceMax)}, ${changeMin}% to ${changeMax >= 0 ? '+' : ''}${changeMax}%`,
      'success'
    );
  };

  const handleResetFilters = () => {
    if (priceMinInput) priceMinInput.value = 0;
    if (priceMaxInput) priceMaxInput.value = 5000000;
    if (changeMinInput) changeMinInput.value = -50;
    if (changeMaxInput) changeMaxInput.value = 50;
    if (searchInput) searchInput.value = '';
    if (searchResults) searchResults.classList.add('hidden');

    updatePriceLabel(0, 5000000);
    updateChangeLabel(-50, 50);
    DataManager.resetFilters();
    triggerFilterChange({});
    PropertyPopup.showNotification('Filters reset', 'info');
  };

  const setupAddressSearch = () => {
    if (!searchInput) return;

    searchInput.addEventListener('input', Utils.debounce(() => {
      const term = searchInput.value.trim();
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
        `
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

  const triggerFilterChange = (newFilters) => {
    DataManager.setFilters(newFilters);
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
      updatePriceLabel(data.priceMin || 0, data.priceMax || 5000000);
    }
    if (data.changeMin !== undefined || data.changeMax !== undefined) {
      updateChangeLabel(data.changeMin || -50, data.changeMax || 50);
    }
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
    handleResetFilters,
    applyRangeFilters,
  };
})();
