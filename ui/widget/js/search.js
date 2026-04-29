const Search = (() => {
  let allProperties = [];
  let isDataLoaded = false;
  let isDataLoading = false;
  let listenersBound = false;
  let readyCallbacks = [];
  let saleIndex = new Map();
  let saleIndexPromise = null;

  const SEARCH_INDEX_URL =
    'https://storage.googleapis.com/musa5090s26-team2-public/configs/property_search_index.json?v=20260429-full-search';
  const SALE_INDEX_URL =
    'https://storage.googleapis.com/musa5090s26-team2-public/configs/property_sale_index.json?v=20260429';

  const init = async () => {
    setupEventListeners();
    setSearchStatus('Loading property data...');

    try {
      isDataLoading = true;
      allProperties = await loadGeoJSONData();
      isDataLoaded = allProperties.length > 0;
      isDataLoading = false;
      loadSaleIndex();
      setSearchStatus('Properties are ready to explore.', 'success');
      readyCallbacks.splice(0).forEach((callback) => callback(allProperties));
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
    const response = await fetch(SEARCH_INDEX_URL);
    if (!response.ok) {
      throw new Error(`Failed to load property search index: ${response.status}`);
    }
    const records = normalizeSearchRecords(await response.json());
    return records
      .map(transformSearchRecord)
      .filter((property) => property.id && property.address);
  };

  const normalizeSearchRecords = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (!payload?.columns || !payload?.rows) return [];

    return payload.rows.map((row) =>
      payload.columns.reduce((record, column, index) => {
        record[column] = row[index];
        return record;
      }, {})
    );
  };

  const loadSaleIndex = () => {
    if (saleIndexPromise) return saleIndexPromise;
    saleIndexPromise = fetch(SALE_INDEX_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load sale index: ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const rows = normalizeSearchRecords(payload);
        saleIndex = new Map(
          rows
            .filter((record) => record.id)
            .map((record) => [
              String(record.id),
              {
                sale_price: toNumber(record.sale_price),
                sale_date: record.sale_date || null,
              },
            ])
        );
        allProperties = allProperties.map(enrichWithSale);
        return saleIndex;
      })
      .catch((error) => {
        console.warn('Sale index unavailable:', error);
        saleIndex = new Map();
        return saleIndex;
      });
    return saleIndexPromise;
  };

  const getSaleById = (id) => saleIndex.get(String(id)) || null;

  const getSaleByIdAsync = async (id) => {
    await loadSaleIndex();
    return getSaleById(id);
  };

  const enrichWithSale = (property) => {
    if (!property?.id) return property;
    const sale = getSaleById(property.id);
    if (!sale) return property;
    return {
      ...property,
      sale_price: Number.isFinite(property.sale_price) && property.sale_price > 0
        ? property.sale_price
        : sale.sale_price,
      sale_date: property.sale_date || sale.sale_date,
    };
  };

  const transformSearchRecord = (record) => {
    const rawPredictedValue = toNumber(record.predicted_value);
    const predictedValue =
      Number.isFinite(rawPredictedValue) && rawPredictedValue > 0 ? rawPredictedValue : null;
    const marketValue = toNumber(record.market_value ?? record.last_year_value);
    const changePercent = Number.isFinite(predictedValue) ? toNumber(record.change_percent) : null;

    return {
      id: String(record.id || record.property_id || ''),
      address: record.address || record.location || 'Address not available',
      property_type: record.property_type || record.bldg_desc || 'Residential',
      lat: toNumber(record.lat),
      lng: toNumber(record.lng),
      market_value: marketValue ?? predictedValue,
      last_year_value: marketValue,
      tax_year_value: marketValue ?? predictedValue,
      predicted_value: predictedValue,
      change_percent:
        changePercent ??
        (Number.isFinite(marketValue) && Number.isFinite(predictedValue) && marketValue > 0
          ? ((predictedValue - marketValue) / marketValue) * 100
          : null),
      lot_size: toNumber(record.lot_size),
      sale_date: record.sale_date || null,
      sale_price: toNumber(record.sale_price),
      sale_year: toNumber(record.sale_year),
      sale_month: toNumber(record.sale_month),
      location: record.location || record.address || null,
      bldg_desc: record.bldg_desc || null,
      zip_code: record.zip_code || null,
      has_prediction: Number.isFinite(predictedValue),
    };
  };

  const transformFullFeature = (feature) => {
    const props = feature.properties || {};
    const [lng, lat] = getFeatureCoordinate(feature.geometry);

    return {
      id: String(props.property_id || ''),
      address: props.location || 'Address not available',
      property_type: 'Residential',
      lat,
      lng,
      market_value: toNumber(props.market_value),
      last_year_value: toNumber(props.market_value),
      tax_year_value: toNumber(props.market_value),
      predicted_value: null,
      change_percent: null,
      lot_size: null,
      sale_date: props.sale_date || null,
      sale_price: toNumber(props.sale_price),
      location: props.location || null,
      shape: props.shape || null,
      has_prediction: false,
    };
  };

  const transformMlFeature = (feature) => {
    const props = feature.properties || {};
    const [lng, lat] = getFeatureCoordinate(feature.geometry);
    const predictedValue = toNumber(props.predicted_value);
    const marketValue = props.log_price
      ? Math.exp(Number(props.log_price))
      : toNumber(props.market_value);

    return {
      id: String(props.property_id || ''),
      address: props.address || props.location || 'Address not available',
      property_type: props.bldg_desc || 'Residential',
      lat,
      lng,
      market_value: marketValue,
      last_year_value: marketValue,
      tax_year_value: marketValue,
      predicted_value: predictedValue,
      change_percent:
        Number.isFinite(marketValue) && Number.isFinite(predictedValue) && marketValue > 0
          ? ((predictedValue - marketValue) / marketValue) * 100
          : null,
      lot_size: toNumber(props.gross_area),
      bldg_desc: props.bldg_desc || null,
      zip_code: props.zip_code || null,
      has_prediction: Number.isFinite(predictedValue),
    };
  };

  const mergePropertyRecords = (fullProperty, mlProperty) => {
    if (!mlProperty) {
      return fullProperty;
    }

    return {
      ...fullProperty,
      ...mlProperty,
      address: fullProperty.address || mlProperty.address,
      lat: Number.isFinite(fullProperty.lat) ? fullProperty.lat : mlProperty.lat,
      lng: Number.isFinite(fullProperty.lng) ? fullProperty.lng : mlProperty.lng,
      market_value: Number.isFinite(fullProperty.market_value)
        ? fullProperty.market_value
        : mlProperty.market_value,
      last_year_value: Number.isFinite(fullProperty.market_value)
        ? fullProperty.market_value
        : mlProperty.last_year_value,
      tax_year_value: Number.isFinite(fullProperty.market_value)
        ? fullProperty.market_value
        : mlProperty.tax_year_value,
      predicted_value: Number.isFinite(mlProperty.predicted_value)
        ? mlProperty.predicted_value
        : null,
      change_percent:
        Number.isFinite(fullProperty.market_value) &&
        Number.isFinite(mlProperty.predicted_value) &&
        fullProperty.market_value > 0
          ? ((mlProperty.predicted_value - fullProperty.market_value) /
              fullProperty.market_value) *
            100
          : mlProperty.change_percent,
      property_type: mlProperty.property_type || fullProperty.property_type,
      lot_size: Number.isFinite(mlProperty.lot_size) ? mlProperty.lot_size : fullProperty.lot_size,
      sale_date: fullProperty.sale_date || null,
      sale_price: Number.isFinite(fullProperty.sale_price) ? fullProperty.sale_price : null,
      has_prediction: Number.isFinite(mlProperty.predicted_value),
    };
  };

  const getFeatureCoordinate = (geometry) => {
    if (!geometry || !geometry.coordinates) return [null, null];

    if (geometry.type === 'Point') return geometry.coordinates;

    const ring =
      geometry.type === 'Polygon'
        ? geometry.coordinates[0]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates[0]?.[0]
          : null;

    if (!ring?.length) return [null, null];

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
    const addressSearchContainer = document.getElementById('addressSearchContainer');
    const idSearchContainer = document.getElementById('idSearchContainer');
    const addressTab = document.getElementById('searchByAddressTab');
    const idTab = document.getElementById('searchByIdTab');
    const sampleAddressButtons = document.querySelectorAll('.sample-address');

    if (!addressInput || !searchBtn || !autocompleteDropdown) return;

    listenersBound = true;

    addressTab?.addEventListener('click', () => {
      addressSearchContainer.classList.remove('hidden');
      idSearchContainer.classList.add('hidden');
      addressTab.classList.add('text-[#a0caff]', 'border-[#a0caff]');
      addressTab.classList.remove('text-[#e2e2e2]/60', 'border-transparent');
      idTab?.classList.remove('text-[#a0caff]', 'border-[#a0caff]');
      idTab?.classList.add('text-[#e2e2e2]/60', 'border-transparent');
      addressInput.focus();
    });

    idTab?.addEventListener('click', () => {
      addressSearchContainer.classList.add('hidden');
      idSearchContainer.classList.remove('hidden');
      idTab.classList.add('text-[#a0caff]', 'border-[#a0caff]');
      idTab.classList.remove('text-[#e2e2e2]/60', 'border-transparent');
      addressTab?.classList.remove('text-[#a0caff]', 'border-[#a0caff]');
      addressTab?.classList.add('text-[#e2e2e2]/60', 'border-transparent');
      opaIdInput?.focus();
    });

    addressInput.addEventListener('input', (event) => {
      const term = event.target.value.trim();

      if (term.length < 2) {
        autocompleteDropdown.classList.add('hidden');
        setSearchStatus(
          isDataLoaded ? 'Properties are ready to explore.' : 'Loading property data...'
        );
        return;
      }

      if (!isDataLoaded) {
        setSearchStatus('Still loading property data. Please wait a moment...');
        return;
      }

      displayAutocomplete(getSuggestions(term));
    });

    document.addEventListener('click', (event) => {
      if (
        !addressInput.contains(event.target) &&
        !autocompleteDropdown.contains(event.target)
      ) {
        autocompleteDropdown.classList.add('hidden');
      }
    });

    searchBtn.addEventListener('click', () => {
      const address = addressInput.value.trim();
      if (address) performSearch(address);
    });

    addressInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        performSearch(addressInput.value.trim());
      }
    });

    searchByIdBtn?.addEventListener('click', () => {
      const id = opaIdInput.value.trim();
      if (id) searchById(id);
    });

    opaIdInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        searchById(opaIdInput.value.trim());
      }
    });

    sampleAddressButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const address = button.dataset.address;
        const propertyId = button.dataset.id;

        if (address) {
          addressSearchContainer.classList.remove('hidden');
          idSearchContainer.classList.add('hidden');
          addressTab?.classList.add('text-[#a0caff]', 'border-[#a0caff]');
          addressTab?.classList.remove('text-[#e2e2e2]/60', 'border-transparent');
          idTab?.classList.remove('text-[#a0caff]', 'border-[#a0caff]');
          idTab?.classList.add('text-[#e2e2e2]/60', 'border-transparent');
          addressInput.value = address;
          performSearch(address);
          return;
        }

        if (propertyId) {
          addressSearchContainer.classList.add('hidden');
          idSearchContainer.classList.remove('hidden');
          idTab?.classList.add('text-[#a0caff]', 'border-[#a0caff]');
          idTab?.classList.remove('text-[#e2e2e2]/60', 'border-transparent');
          addressTab?.classList.remove('text-[#a0caff]', 'border-[#a0caff]');
          addressTab?.classList.add('text-[#e2e2e2]/60', 'border-transparent');
          if (opaIdInput) opaIdInput.value = propertyId;
          searchById(propertyId);
        }
      });
    });
  };

  const getSuggestions = (term) => {
    const normalizedTerm = normalizeSearchText(term);
    const fallbackTerm = getStreetFallbackTerm(term);

    const exactish = allProperties.filter(
      (property) =>
        normalizeSearchText(property.address).includes(normalizedTerm) ||
        String(property.id).includes(term)
    );

    const fallback =
      exactish.length > 0 || !fallbackTerm
        ? []
        : allProperties.filter((property) =>
            normalizeSearchText(property.address).includes(fallbackTerm)
          );

    return [...exactish, ...fallback].slice(0, 8).map((property) => ({
      id: property.id,
      address: property.address,
      type: property.property_type,
    }));
  };

  const displayAutocomplete = (suggestions) => {
    const dropdown = document.getElementById('autocompleteDropdown');
    const suggestionList = document.getElementById('autocompleteList');
    if (!dropdown || !suggestionList) return;

    if (!suggestions.length) {
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
    suggestionList.querySelectorAll('[data-property-id]').forEach((element) => {
      element.addEventListener('click', () => selectProperty(element.dataset.propertyId));
    });
  };

  const performSearch = (searchTerm) => {
    document.getElementById('autocompleteDropdown')?.classList.add('hidden');
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
      (property) =>
        normalizeSearchText(property.address).includes(normalizedTerm) ||
        String(property.id).includes(searchTerm)
    );

    if (!results.length) {
      const suggestions = getClosestProperties(searchTerm, 5).map((property) => ({
        id: property.id,
        address: property.address,
        type: property.property_type,
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
      return;
    }

    selectProperty(id);
  };

  const selectProperty = (propertyId) => {
    const property = getPropertyById(propertyId);
    if (!property) {
      setSearchStatus('Property not found. Try another address or OPA ID.');
      return;
    }

    const addressInput = document.getElementById('addressSearch');
    const opaIdInput = document.getElementById('opaIdSearch');
    if (addressInput) addressInput.value = property.address;
    if (opaIdInput) opaIdInput.value = property.id;

    document.getElementById('autocompleteDropdown')?.classList.add('hidden');
    setSearchStatus(`Selected ${property.address} (OPA ${property.id}).`);
    PropertyDisplay?.displayProperty?.(property);
  };

  const getPropertyById = (id) =>
    allProperties.find((property) => String(property.id) === String(id)) || null;

  const getAllProperties = () => allProperties;

  const isReady = () => isDataLoaded;

  const onReady = (callback) => {
    if (typeof callback !== 'function') return;
    if (isDataLoaded) {
      callback(allProperties);
      return;
    }
    readyCallbacks.push(callback);
  };

  const showNotification = (message, type = 'info') => {
    setSearchStatus(message, type);
  };

  const setSearchStatus = (message, type = 'info') => {
    const status = document.getElementById('searchStatus');
    if (!status) return;

    status.textContent = message || '';
    status.classList.remove('text-[#ffb2b6]', 'text-[#a0caff]', 'text-[#e2e2e2]/60');
    status.classList.add(
      type === 'error'
        ? 'text-[#ffb2b6]'
        : type === 'success'
          ? 'text-[#a0caff]'
          : 'text-[#e2e2e2]/60'
    );
  };

  const normalizeSearchText = (value) =>
    String(value || '')
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
    const previous = Array.from({ length: shortB.length + 1 }, (_, index) => index);
    const current = Array(shortB.length + 1).fill(0);

    for (let i = 1; i <= a.length; i += 1) {
      current[0] = i;
      for (let j = 1; j <= shortB.length; j += 1) {
        const cost = a[i - 1] === shortB[j - 1] ? 0 : 1;
        current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      }
      for (let j = 0; j <= shortB.length; j += 1) previous[j] = current[j];
    }

    return previous[shortB.length];
  };

  const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    init,
    loadGeoJSONData,
    loadSaleIndex,
    getSuggestions,
    performSearch,
    searchById,
    selectProperty,
    getPropertyById,
    getSaleById,
    getSaleByIdAsync,
    enrichWithSale,
    getAllProperties,
    isReady,
    onReady,
  };
})();
