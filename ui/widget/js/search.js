/**
 * Search Module for Property Owner Widget
 * Handles address search and autocomplete functionality.
 */

const Search = (() => {
  let allProperties = [];
  let isDataLoaded = false;
  let isDataLoading = false;
  let listenersBound = false;

  const geoJsonUrl =
    'https://storage.googleapis.com/musa5090s26-team2-temp_data/property_tile_info.geojson';

  const init = async () => {
    console.log('Initializing Search Module...');

    setupEventListeners();
    setSearchStatus('Loading property data...');

    try {
      isDataLoading = true;
      allProperties = await loadGeoJSONData();
      isDataLoaded = allProperties.length > 0;
      isDataLoading = false;

      console.log(`Loaded ${allProperties.length} properties for search`);
      setSearchStatus(
        `Ready. ${allProperties.length.toLocaleString()} properties loaded.`,
        'success'
      );
    } catch (error) {
      isDataLoading = false;
      console.error('Error initializing search:', error);
      setSearchStatus(
        'Property data could not be loaded. Please refresh the page.',
        'error'
      );
    }
  };

  const loadGeoJSONData = async () => {
    const response = await fetch(geoJsonUrl);
    if (!response.ok) {
      throw new Error(`Failed to load GeoJSON: ${response.status}`);
    }

    const geoJsonData = await response.json();
    const properties = geoJsonData.features.map((feature) => {
      const props = feature.properties || {};
      const [lng, lat] = getFeatureCoordinate(feature.geometry);
      const marketValue = Number(props.market_value);
      const predictedValue = Number(props.predicted_value);
      const lastYearValue = Number.isFinite(marketValue)
        ? marketValue
        : props.log_price
          ? Math.exp(Number(props.log_price))
          : null;
      const currentValue = Number.isFinite(predictedValue) ? predictedValue : null;
      const changePercent = lastYearValue
        && Number.isFinite(currentValue)
        ? ((currentValue - lastYearValue) / lastYearValue) * 100
        : null;

      return {
        id: String(props.property_id || ''),
        address: props.address || 'Address not available',
        property_type: props.bldg_desc || 'Unknown',
        lat,
        lng,
        last_year_value: lastYearValue,
        tax_year_value: lastYearValue,
        market_value: lastYearValue,
        predicted_value: currentValue,
        change_percent: changePercent,
        lot_size: Number(props.gross_area || 0),
        year_built: null,
        tax_status: 'Current',
        neighborhood: null,
      };
    });

    console.log(`Successfully loaded ${properties.length} properties from GeoJSON`);
    return properties;
  };

  const getFeatureCoordinate = (geometry) => {
    if (!geometry || !geometry.coordinates) return [null, null];

    if (geometry.type === 'Point') {
      return geometry.coordinates;
    }

    const ring =
      geometry.type === 'Polygon'
        ? geometry.coordinates[0]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates[0]?.[0]
          : null;

    if (!ring || ring.length === 0) return [null, null];

    const totals = ring.reduce(
      (acc, coord) => {
        acc.lng += Number(coord[0] || 0);
        acc.lat += Number(coord[1] || 0);
        return acc;
      },
      { lng: 0, lat: 0 }
    );

    return [totals.lng / ring.length, totals.lat / ring.length];
  };

  const setupEventListeners = () => {
    if (listenersBound) return;

    const addressInput = document.getElementById('addressSearch');
    const searchBtn = document.getElementById('searchBtn');
    const autocompleteDropdown = document.getElementById('autocompleteDropdown');
    const opaIdInput = document.getElementById('opaIdSearch');
    const searchByIdBtn = document.getElementById('searchByIdBtn');
    const addressSearchContainer = document.getElementById(
      'addressSearchContainer'
    );
    const idSearchContainer = document.getElementById('idSearchContainer');
    const addressTab = document.getElementById('searchByAddressTab');
    const idTab = document.getElementById('searchByIdTab');
    const sampleAddressButtons = document.querySelectorAll('.sample-address');

    if (!addressInput || !searchBtn || !autocompleteDropdown) {
      console.warn('Search elements not found in DOM');
      return;
    }

    listenersBound = true;
    console.log('Search event listeners setup');

    if (addressTab && idTab) {
      addressTab.addEventListener('click', () => {
        addressSearchContainer.classList.remove('hidden');
        idSearchContainer.classList.add('hidden');
        addressTab.classList.add('text-[#a0caff]', 'border-[#a0caff]');
        addressTab.classList.remove('text-[#e2e2e2]/60', 'border-transparent');
        idTab.classList.remove('text-[#a0caff]', 'border-[#a0caff]');
        idTab.classList.add('text-[#e2e2e2]/60', 'border-transparent');
        addressInput.focus();
      });

      idTab.addEventListener('click', () => {
        addressSearchContainer.classList.add('hidden');
        idSearchContainer.classList.remove('hidden');
        idTab.classList.add('text-[#a0caff]', 'border-[#a0caff]');
        idTab.classList.remove('text-[#e2e2e2]/60', 'border-transparent');
        addressTab.classList.remove('text-[#a0caff]', 'border-[#a0caff]');
        addressTab.classList.add('text-[#e2e2e2]/60', 'border-transparent');
        opaIdInput.focus();
      });
    }

    addressInput.addEventListener('input', (e) => {
      const term = e.target.value.trim();

      if (term.length < 2) {
        autocompleteDropdown.classList.add('hidden');
        setSearchStatus(
          isDataLoaded
            ? `${allProperties.length.toLocaleString()} properties loaded.`
            : 'Loading property data...'
        );
        return;
      }

      if (!isDataLoaded) {
        setSearchStatus('Still loading property data. Please wait a moment...');
        return;
      }

      displayAutocomplete(getSuggestions(term));
    });

    document.addEventListener('click', (e) => {
      if (
        !addressInput.contains(e.target) &&
        !autocompleteDropdown.contains(e.target)
      ) {
        autocompleteDropdown.classList.add('hidden');
      }
    });

    searchBtn.addEventListener('click', () => {
      const address = addressInput.value.trim();
      if (address) performSearch(address);
    });

    addressInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        performSearch(addressInput.value.trim());
      }
    });

    if (searchByIdBtn) {
      searchByIdBtn.addEventListener('click', () => {
        const id = opaIdInput.value.trim();
        if (id) searchById(id);
      });
    }

    if (opaIdInput) {
      opaIdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          searchById(opaIdInput.value.trim());
        }
      });
    }

    sampleAddressButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const address = button.dataset.address;
        if (!address) return;

        addressSearchContainer.classList.remove('hidden');
        idSearchContainer.classList.add('hidden');
        addressTab.classList.add('text-[#a0caff]', 'border-[#a0caff]');
        addressTab.classList.remove('text-[#e2e2e2]/60', 'border-transparent');
        idTab.classList.remove('text-[#a0caff]', 'border-[#a0caff]');
        idTab.classList.add('text-[#e2e2e2]/60', 'border-transparent');

        addressInput.value = address;
        performSearch(address);
      });
    });
  };

  const getSuggestions = (term) => {
    const normalizedTerm = normalizeSearchText(term);
    const fallbackTerm = getStreetFallbackTerm(term);

    const exactish = allProperties.filter(
      (prop) =>
        normalizeSearchText(prop.address).includes(normalizedTerm) ||
        String(prop.id).includes(term)
    );

    const fallback =
      exactish.length > 0 || !fallbackTerm
        ? []
        : allProperties.filter((prop) =>
            normalizeSearchText(prop.address).includes(fallbackTerm)
          );

    return [...exactish, ...fallback].slice(0, 8).map((prop) => ({
      id: prop.id,
      address: prop.address,
      type: prop.property_type,
    }));
  };

  const displayAutocomplete = (suggestions) => {
    const dropdown = document.getElementById('autocompleteDropdown');
    const suggestionList = document.getElementById('autocompleteList');

    if (!dropdown || !suggestionList) return;

    if (suggestions.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }

    suggestionList.innerHTML = suggestions
      .map(
        (suggestion) => `
      <div class="px-4 py-3 border-b border-[#e2e2e2]/10 cursor-pointer hover:bg-[#121414] transition-colors"
           data-property-id="${suggestion.id}">
        <div class="font-600 text-sm">${suggestion.address}</div>
        <div class="text-xs text-[#e2e2e2]/40 mt-1">${suggestion.type} - ID: ${suggestion.id}</div>
      </div>
    `
      )
      .join('');

    dropdown.classList.remove('hidden');

    suggestionList.querySelectorAll('[data-property-id]').forEach((el) => {
      el.addEventListener('click', () => {
        selectProperty(el.dataset.propertyId);
      });
    });
  };

  const performSearch = (searchTerm) => {
    const dropdown = document.getElementById('autocompleteDropdown');
    if (dropdown) dropdown.classList.add('hidden');

    if (!searchTerm) return;

    if (!isDataLoaded) {
      setSearchStatus(
        isDataLoading
          ? 'Still loading property data. Please wait a moment...'
          : 'Property data is not ready. Please refresh the page.'
      );
      return;
    }

    const normalizedTerm = normalizeSearchText(searchTerm);
    const results = allProperties.filter(
      (prop) =>
        normalizeSearchText(prop.address).includes(normalizedTerm) ||
        String(prop.id).includes(searchTerm)
    );

    if (results.length === 0) {
      const suggestions = getClosestProperties(searchTerm, 5).map((prop) => ({
        id: prop.id,
        address: prop.address,
        type: prop.property_type,
      }));
      displayAutocomplete(suggestions);
      setSearchStatus('No exact match. Showing the 5 closest real addresses.');
      return;
    }

    selectProperty(results[0].id);
  };

  const searchById = (id) => {
    if (!isDataLoaded) {
      setSearchStatus(
        isDataLoading
          ? 'Still loading property data. Please wait a moment...'
          : 'Property data is not ready. Please refresh the page.'
      );
      return;
    }

    const property = getPropertyById(id);

    if (!property) {
      showNotification(`No property found with ID: ${id}`, 'info');
      console.log('Property not found:', id);
      return;
    }

    console.log('Found property by ID:', property.address);
    selectProperty(id);
  };

  const selectProperty = (propertyId) => {
    const property = getPropertyById(propertyId);

    if (!property) {
      console.error('Property not found:', propertyId);
      setSearchStatus('Property not found. Try another address or OPA ID.');
      return;
    }

    console.log('Selected property:', property.address);

    const addressInput = document.getElementById('addressSearch');
    const opaIdInput = document.getElementById('opaIdSearch');
    if (addressInput) addressInput.value = property.address;
    if (opaIdInput) opaIdInput.value = property.id;

    const dropdown = document.getElementById('autocompleteDropdown');
    if (dropdown) dropdown.classList.add('hidden');

    setSearchStatus(`Selected ${property.address} (OPA ${property.id}).`);

    if (typeof PropertyDisplay !== 'undefined') {
      PropertyDisplay.displayProperty(property);
    } else {
      console.error('PropertyDisplay module not found');
    }
  };

  const getPropertyById = (id) => {
    return allProperties.find((p) => String(p.id) === String(id)) || null;
  };

  const getAllProperties = () => {
    return allProperties;
  };

  const showNotification = (message, type = 'info') => {
    console.log(`[${type.toUpperCase()}] ${message}`);
    setSearchStatus(message, type);
  };

  const setSearchStatus = (message, type = 'info') => {
    const status = document.getElementById('searchStatus');
    if (!status) return;

    status.textContent = message || '';
    status.classList.remove(
      'text-[#ffb2b6]',
      'text-[#a0caff]',
      'text-[#e2e2e2]/60'
    );
    status.classList.add(
      type === 'error'
        ? 'text-[#ffb2b6]'
        : type === 'success'
          ? 'text-[#a0caff]'
          : 'text-[#e2e2e2]/60'
    );
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

  const getStreetFallbackTerm = (value) => {
    const normalized = normalizeSearchText(value);
    const withoutHouseNumber = normalized.replace(/^\d+\s+/, '').trim();
    const tokens = withoutHouseNumber.split(' ').filter(Boolean);
    return tokens.length >= 2 ? tokens.slice(0, 2).join(' ') : withoutHouseNumber;
  };

  const getClosestProperties = (term, limit = 5) => {
    const normalizedTerm = normalizeSearchText(term);
    if (!normalizedTerm) return allProperties.slice(0, limit);

    return allProperties
      .map((property) => {
        const address = normalizeSearchText(property.address);
        let score = stringDistance(normalizedTerm, address);
        if (address.includes(normalizedTerm)) score -= 1000;
        if (String(property.id).includes(term)) score -= 1200;
        return { property, score };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, limit)
      .map((item) => item.property);
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

  return {
    init,
    loadGeoJSONData,
    getSuggestions,
    performSearch,
    searchById,
    selectProperty,
    getPropertyById,
    getAllProperties,
  };
})();
