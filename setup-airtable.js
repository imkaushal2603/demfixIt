require('dotenv').config();
const axios = require('axios');

const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
  console.error('Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID in .env first.');
  process.exit(1);
}

const api = axios.create({
  baseURL: 'https://api.airtable.com/v0',
  headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
  timeout: 30000,
});

const text = (name) => ({ name, type: 'singleLineText' });
const long = (name) => ({ name, type: 'multilineText' });
const url = (name) => ({ name, type: 'url' });
const num = (name, precision = 0) => ({ name, type: 'number', options: { precision } });
const when = (name) => ({ name, type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' } });
const select = (name, choices) => ({ name, type: 'singleSelect', options: { choices: choices.map((c) => ({ name: c })) } });
const multi = (name, choices) => ({ name, type: 'multipleSelects', options: { choices: choices.map((c) => ({ name: c })) } });

const SERVICES = ['plumbing', 'electrical', 'aircon', 'painting', 'garden', 'cleaning', 'pool', 'appliance', 'building', 'handyman'];
const STATUSES = ['New', 'Matching', 'Accepted', 'On the way', 'In progress', 'Completed', 'Closed', 'Cancelled', 'No match', 'Disputed'];

const TRADESPEOPLE_FIELDS = [
  text('Name'),
  text('Phone'),
  multi('Services', SERVICES),
  select('Availability', ['Available', 'Busy', 'Unavailable']),
  num('Latitude', 6),
  num('Longitude', 6),
  num('Rating', 1),
  num('Review count', 0),
];

const CUSTOMERS_FIELDS = [
  text('Phone'),
  text('Name'),
  when('Last request'),
  num('Total requests', 0),
];

const JOBS_FIELDS = [
  text('Ref'),
  select('Status', STATUSES),
  text('Service'),
  text('Sub-category'),
  long('Description'),
  select('Urgency', ['Non-emergency', 'Urgent', 'Emergency']),
  text('Preferred time'),
  long('Address'),
  num('Latitude', 6),
  num('Longitude', 6),
  url('Location pin'),
  long('Additional info'),
  num('Media count', 0),
  { name: 'Photos', type: 'multipleAttachments' },
  long('Voice transcripts'),
  when('Received at'),
];

const T = (name, phone, services, availability, lat, lng, rating, reviews) => ({
  'Name': name,
  'Phone': phone,
  'Services': services,
  'Availability': availability,
  'Latitude': lat,
  'Longitude': lng,
  'Rating': rating,
  'Review count': reviews,
});

const DUMMY = [
  T('John Electric', '+12465550101', ['electrical'], 'Available', 13.19, -59.63, 4.8, 40),
  T('Spark Brothers', '+12465550102', ['electrical'], 'Available', 13.13, -59.6, 4.4, 25),
  T('Ray Plumbing', '+12465550103', ['plumbing'], 'Available', 13.115, -59.605, 4.5, 30),
  T('Bajan Pipes & Gas', '+12465550104', ['plumbing'], 'Available', 13.225, -59.64, 4.9, 50),
  T('Cool Breeze A/C', '+12465550105', ['aircon'], 'Available', 13.105, -59.59, 4.6, 35),
  T('Sparkle Cleaning', '+12465550106', ['cleaning'], 'Busy', 13.12, -59.6, 4.7, 60),
  T('Island Brush Painters', '+12465550107', ['painting'], 'Available', 13.1, -59.57, 4.3, 20),
  T('Green Thumb Landscaping', '+12465550108', ['garden'], 'Available', 13.18, -59.62, 4.6, 28),
  T('Blue Wave Pools', '+12465550109', ['pool'], 'Available', 13.16, -59.62, 4.5, 22),
  T('FixIt Appliance Repair', '+12465550110', ['appliance'], 'Available', 13.1, -59.55, 4.4, 18),
  T('Solid Rock Builders', '+12465550111', ['building'], 'Available', 13.14, -59.54, 4.7, 15),
  T('Handy Andy', '+12465550112', ['handyman', 'painting'], 'Available', 13.11, -59.59, 4.2, 45),
  T('Night Owl Electric', '+12465550113', ['electrical'], 'Unavailable', 13.14, -59.61, 4.9, 12),
  T('Aqua Fix Plumbing', '+12465550201', ['plumbing'], 'Available', 13.17, -59.62, 4.6, 80),
  T('Premier Plumbers', '+12465550202', ['plumbing'], 'Available', 13.1, -59.61, 4.3, 120),
  T('Clearflow Drains', '+12465550203', ['plumbing'], 'Available', 13.24, -59.63, 4.7, 35),
  T('Dripstop Pros', '+12465550204', ['plumbing'], 'Available', 13.08, -59.52, 4.1, 60),
  T('Coral Coast Plumbing', '+12465550205', ['plumbing'], 'Available', 13.2, -59.64, 4.8, 95),
  T('Reliable Rob', '+12465550206', ['plumbing', 'handyman'], 'Available', 13.18, -59.58, 4.0, 10),
  T('Bright Spark Electric', '+12465550211', ['electrical'], 'Available', 13.18, -59.63, 4.7, 70),
  T('Volt Masters', '+12465550212', ['electrical'], 'Available', 13.11, -59.6, 4.5, 110),
  T('Amp Up Electrical', '+12465550213', ['electrical'], 'Available', 13.23, -59.64, 4.6, 45),
  T('Circuit City Electric', '+12465550214', ['electrical'], 'Available', 13.08, -59.5, 4.2, 55),
  T('Power Pros', '+12465550215', ['electrical'], 'Available', 13.19, -59.59, 4.4, 33),
  T('Live Wire Services', '+12465550216', ['electrical'], 'Available', 13.13, -59.54, 4.9, 20),
];

const errText = (e) => JSON.stringify(e.response?.data || e.message, null, 2);

async function listTables() {
  const r = await api.get(`/meta/bases/${AIRTABLE_BASE_ID}/tables`);
  return r.data.tables;
}

async function ensureTable(tables, name, description, fields) {
  const existing = tables.find((t) => t.name === name);
  if (existing) {
    console.log(`↪️  Table "${name}" already exists`);
    return existing;
  }
  const r = await api.post(`/meta/bases/${AIRTABLE_BASE_ID}/tables`, { name, description, fields });
  console.log(`✅ Created table "${name}" (${fields.length} fields)`);
  tables.push(r.data);
  return r.data;
}

async function ensureFields(table, expected) {
  const have = new Set((table.fields || []).map((f) => f.name));
  for (const f of expected) {
    if (have.has(f.name)) continue;
    const r = await api.post(`/meta/bases/${AIRTABLE_BASE_ID}/tables/${table.id}/fields`, f);
    (table.fields = table.fields || []).push(r.data);
    console.log(`➕ Added ${table.name}.${f.name}`);
  }
}

async function ensureLink(table, fieldName, linkedTable) {
  if ((table.fields || []).some((f) => f.name === fieldName)) {
    console.log(`↪️  ${table.name}.${fieldName} already exists`);
    return;
  }
  const r = await api.post(`/meta/bases/${AIRTABLE_BASE_ID}/tables/${table.id}/fields`, {
    name: fieldName,
    type: 'multipleRecordLinks',
    options: { linkedTableId: linkedTable.id },
  });
  (table.fields = table.fields || []).push(r.data);
  console.log(`✅ Linked ${table.name}.${fieldName} → ${linkedTable.name}`);
}

async function seedTradespeople() {
  const names = new Set();
  let offset;
  do {
    const r = await api.get(`/${AIRTABLE_BASE_ID}/Tradespeople`, { params: { pageSize: 100, ...(offset ? { offset } : {}) } });
    r.data.records.forEach((rec) => rec.fields.Name && names.add(rec.fields.Name));
    offset = r.data.offset;
  } while (offset);

  const toAdd = DUMMY.filter((d) => !names.has(d.Name));
  if (!toAdd.length) {
    console.log('↪️  All dummy tradespeople are already there');
    return;
  }
  for (let i = 0; i < toAdd.length; i += 10) {
    await api.post(`/${AIRTABLE_BASE_ID}/Tradespeople`, {
      records: toAdd.slice(i, i + 10).map((fields) => ({ fields })),
      typecast: true,
    });
  }
  console.log(`✅ Added ${toAdd.length} dummy tradespeople`);
}

(async () => {
  try {
    const tables = await listTables();

    const trades = await ensureTable(tables, 'Tradespeople', 'Tradespeople who receive job offers', TRADESPEOPLE_FIELDS);
    const customers = await ensureTable(tables, 'Customers', 'People who message DemFixIt on WhatsApp', CUSTOMERS_FIELDS);
    const jobs = await ensureTable(tables, 'Jobs', 'One row per job request collected on WhatsApp', JOBS_FIELDS);

    await ensureFields(trades, TRADESPEOPLE_FIELDS);
    await ensureFields(customers, CUSTOMERS_FIELDS);
    await ensureFields(jobs, JOBS_FIELDS);

    await ensureLink(jobs, 'Customer', customers);
    await ensureLink(jobs, 'Assigned tradesperson', trades);

    await seedTradespeople();

    console.log('\nDone. Open your base to check Tradespeople, Customers and Jobs.');
  } catch (e) {
    console.error('❌ Setup failed:', errText(e));
    console.error('\nCommon causes: the token is missing a scope (schema.bases:write) or does not have access to this base, or the Base ID is wrong.');
    process.exit(1);
  }
})();