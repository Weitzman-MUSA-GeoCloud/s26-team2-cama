const fs = require('fs');
const https = require('https');

const BASE_URL =
  process.env.BASE_URL ||
  'https://storage.googleapis.com/musa5090s26-team2-public/residential_market_value.geojson';
const ML_INDEX_URL =
  process.env.ML_INDEX_URL ||
  'https://storage.googleapis.com/musa5090s26-team2-public/configs/property_search_index.json';
const OUT_PATH = process.env.OUT_PATH || 'property_search_index_full.json';

const columns = [
  'id',
  'address',
  'property_type',
  'bldg_desc',
  'lat',
  'lng',
  'market_value',
  'predicted_value',
  'change_percent',
  'lot_size',
  'zip_code',
  'neighborhood',
  'sale_year',
  'sale_month',
  'sale_price',
  'sale_date',
];

const downloadText = (url) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
          return;
        }
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      })
      .on('error', reject);
  });

const normalizeRows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload?.columns || !payload?.rows) return [];
  return payload.rows.map((row) =>
    Object.fromEntries(payload.columns.map((column, index) => [column, row[index]]))
  );
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const round = (value, digits = 0) => {
  const number = toNumber(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

const centroid = (geometry) => {
  const coords = geometry?.coordinates;
  if (!coords) return [null, null];
  if (geometry.type === 'Point') return [toNumber(coords[0]), toNumber(coords[1])];
  const ring = geometry.type === 'Polygon' ? coords[0] : geometry.type === 'MultiPolygon' ? coords[0]?.[0] : null;
  if (!ring?.length) return [null, null];
  const valid = ring
    .map((coord) => [toNumber(coord[0]), toNumber(coord[1])])
    .filter(([lng, lat]) => lng !== null && lat !== null);
  if (!valid.length) return [null, null];
  return [
    valid.reduce((sum, [lng]) => sum + lng, 0) / valid.length,
    valid.reduce((sum, [, lat]) => sum + lat, 0) / valid.length,
  ];
};

const saleParts = (saleDate) => {
  const match = saleDate ? String(saleDate).match(/^(\d{4})-(\d{2})/) : null;
  return match ? [Number(match[1]), Number(match[2])] : [null, null];
};

const rowValues = (record) => columns.map((column) => record[column] ?? null);

(async () => {
  const [baseText, mlText] = await Promise.all([downloadText(BASE_URL), downloadText(ML_INDEX_URL)]);
  const baseGeojson = JSON.parse(baseText);
  const mlById = new Map(
    normalizeRows(JSON.parse(mlText)).map((record) => [String(record.id || record.property_id || ''), record])
  );

  const output = fs.createWriteStream(OUT_PATH, { encoding: 'utf8' });
  output.write('{"schema_version":1,"columns":');
  output.write(JSON.stringify(columns));
  output.write(',"rows":[\n');

  let first = true;
  let count = 0;
  let predictedCount = 0;

  for (const feature of baseGeojson.features || []) {
    const properties = feature.properties || {};
    const id = String(properties.property_id || properties.parcel_number || '').trim();
    if (!id) continue;

    const ml = mlById.get(id) || {};
    const [lng, lat] = centroid(feature.geometry);
    const marketValue = toNumber(properties.market_value) ?? toNumber(ml.market_value);
    const rawPredicted = toNumber(ml.predicted_value);
    const predictedValue = rawPredicted && rawPredicted > 0 ? rawPredicted : null;
    const changePercent =
      marketValue && predictedValue ? ((predictedValue - marketValue) / marketValue) * 100 : null;
    const saleDate = properties.sale_date || ml.sale_date || null;
    const [saleYear, saleMonth] = saleParts(saleDate);

    if (predictedValue) predictedCount += 1;

    const record = {
      id,
      address: properties.location || ml.address || ml.location || `Property ${id}`,
      property_type: ml.property_type || ml.bldg_desc || 'Residential',
      bldg_desc: ml.bldg_desc || ml.property_type || null,
      lat: round(toNumber(ml.lat) ?? lat, 7),
      lng: round(toNumber(ml.lng) ?? lng, 7),
      market_value: round(marketValue, 0),
      predicted_value: round(predictedValue, 0),
      change_percent: round(toNumber(ml.change_percent) ?? changePercent, 2),
      lot_size: round(toNumber(ml.lot_size), 0),
      zip_code: ml.zip_code || null,
      neighborhood: ml.neighborhood || ml.zip_code || null,
      sale_year: toNumber(ml.sale_year) ?? saleYear,
      sale_month: toNumber(ml.sale_month) ?? saleMonth,
      sale_price: round(toNumber(properties.sale_price) ?? toNumber(ml.sale_price), 0),
      sale_date: saleDate,
    };

    if (!first) output.write(',\n');
    output.write(JSON.stringify(rowValues(record)));
    first = false;
    count += 1;
  }

  output.write('\n]}');
  output.end();
  await new Promise((resolve) => output.on('finish', resolve));
  console.log(JSON.stringify({ output: OUT_PATH, count, predictedCount }, null, 2));
})();
