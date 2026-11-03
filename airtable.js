const fs = require('fs');
const axios = require('axios');

const CUSTOMERS = 'Customers';
const JOBS = 'Jobs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const enabled = () => Boolean(process.env.AIRTABLE_TOKEN && process.env.AIRTABLE_BASE_ID);
const headers = () => ({ Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' });
const tableUrl = (name) => `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(name)}`;

const nul = (v) => (v === undefined || v === '' || (Array.isArray(v) && v.length === 0) ? null : v);
const nullify = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, nul(v)]));

async function call(fn) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const status = e.response?.status;
      console.error(`❌ Airtable error (attempt ${attempt}):`, JSON.stringify(e.response?.data || e.message));
      if (status && status < 500 && status !== 429) break;
      await sleep(attempt * 2000);
    }
  }
  throw last;
}

function saveLocal(request, reason) {
  try {
    fs.appendFileSync('failed-airtable.jsonl', JSON.stringify({ at: new Date().toISOString(), reason, request }) + '\n');
    console.warn('💾 Request saved to failed-airtable.jsonl instead');
  } catch (e) {
    console.error('❌ Could not write failed-airtable.jsonl:', e.message);
  }
}

async function findCustomer(phone) {
  const r = await axios.get(tableUrl(CUSTOMERS), {
    headers: headers(),
    params: { maxRecords: 1, filterByFormula: `{Phone}="${phone}"` },
    timeout: 20000,
  });
  return r.data.records[0] ?? null;
}

async function saveRequest(r) {
  if (!enabled()) {
    console.warn('⚠️ Airtable is not configured (AIRTABLE_TOKEN / AIRTABLE_BASE_ID).');
    saveLocal(r, 'airtable not configured');
    return false;
  }

  try {
    let customer = await call(() => findCustomer(r.customerPhone));

    if (customer) {
      const total = Number(customer.fields['Total requests'] || 0) + 1;
      const update = { 'Last request': r.receivedAt, 'Total requests': total };
      if (r.customerName) update['Name'] = r.customerName;
      await call(() =>
        axios.patch(`${tableUrl(CUSTOMERS)}/${customer.id}`, { fields: update, typecast: true }, { headers: headers(), timeout: 20000 })
      );
    } else {
      const created = await call(() =>
        axios.post(
          tableUrl(CUSTOMERS),
          {
            records: [{ fields: nullify({
              'Phone': r.customerPhone,
              'Name': r.customerName,
              'Last request': r.receivedAt,
              'Total requests': 1,
            }) }],
            typecast: true,
          },
          { headers: headers(), timeout: 20000 }
        )
      );
      customer = created.data.records[0];
    }

    const jobFields = nullify({
      'Ref': r.ref,
      'Status': r.status,
      'Customer': [customer.id],
      'Service': r.category,
      'Sub-category': r.sub_category,
      'Description': r.description,
      'Urgency': r.urgency,
      'Preferred time': r.when,
      'Address': r.address,
      'Latitude': r.lat,
      'Longitude': r.lng,
      'Location pin': r.mapLink,
      'Additional info': r.additional_info,
      'Media count': r.mediaCount,
      'Photo flags': r.photoFlags,
      'Voice transcripts': r.voiceTranscripts,
      'Received at': r.receivedAt,
    });

    const job = await call(() =>
      axios.post(tableUrl(JOBS), { records: [{ fields: jobFields }], typecast: true }, { headers: headers(), timeout: 20000 })
    );

    console.log(`📒 Saved to Airtable: ${r.ref} (customer ${customer.id}, job ${job.data.records[0].id})`);
    return true;
  } catch (e) {
    saveLocal(r, JSON.stringify(e.response?.data || e.message));
    return false;
  }
}

module.exports = { enabled, saveRequest };