const https = require('https');
const fs = require('fs');

const INPUT_URL =
  process.env.INPUT_URL ||
  'https://storage.googleapis.com/musa5090s26-team2-public/residential_market_value.geojson';
const OUTPUT_PATH = process.env.OUTPUT_PATH || 'property_sale_index.json';

const download = (url) =>
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

const toSaleRow = (feature) => {
  const properties = feature.properties || {};
  const id = String(properties.property_id || properties.parcel_number || '').trim();
  if (!id) return null;

  const salePrice = Number(properties.sale_price);
  return [
    id,
    Number.isFinite(salePrice) ? Math.round(salePrice) : null,
    properties.sale_date ? String(properties.sale_date) : null,
  ];
};

(async () => {
  const text = await download(INPUT_URL);
  const geojson = JSON.parse(text);
  const rows = (geojson.features || []).map(toSaleRow).filter(Boolean);

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({
      schema_version: 1,
      columns: ['id', 'sale_price', 'sale_date'],
      rows,
    })
  );

  console.log(
    JSON.stringify(
      {
        output: OUTPUT_PATH,
        rows: rows.length,
        bytes: fs.statSync(OUTPUT_PATH).size,
      },
      null,
      2
    )
  );
})();
