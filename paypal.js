const axios = require('axios');

const BASE = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

async function accessToken() {
    const r = await axios.post(`${BASE}/v1/oauth2/token`, 'grant_type=client_credentials', {
        auth: { username: process.env.PAYPAL_CLIENT_ID, password: process.env.PAYPAL_CLIENT_SECRET },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
    });
    return r.data.access_token;
}

async function createOrder({ ref, amount = '1.00', description }) {
    const token = await accessToken();
    const r = await axios.post(
        `${BASE}/v2/checkout/orders`,
        {
            intent: 'CAPTURE',
            purchase_units: [{
                reference_id: ref,
                invoice_id: ref,
                description,
                amount: { currency_code: 'USD', value: amount },
            }],
            payment_source: {
                paypal: {
                    experience_context: {
                        return_url: `${process.env.BASE_URL}/paypal/return`,
                        cancel_url: `${process.env.BASE_URL}/paypal/cancel`,
                        user_action: 'PAY_NOW',
                        shipping_preference: 'NO_SHIPPING',
                    },
                },
            },
        },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': ref }, timeout: 20000 }
    );
    const link = r.data.links.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
    return { id: r.data.id, link };
}

async function captureOrder(orderId) {
    const token = await accessToken();
    const r = await axios.post(`${BASE}/v2/checkout/orders/${orderId}/capture`, {}, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000,
    });
    return r.data;
}

async function createInvoice({ ref, amount = '1.00', description }) {
    const token = await accessToken();
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const draft = await axios.post(
        `${BASE}/v2/invoicing/invoices`,
        {
            detail: {
                invoice_number: ref,
                reference: ref,
                invoice_date: new Date().toISOString().slice(0, 10),
                currency_code: 'USD',
                note: description,
                payment_term: { term_type: 'DUE_ON_RECEIPT' },
            },
            ...(process.env.PAYPAL_MERCHANT_EMAIL ? { invoicer: { email_address: process.env.PAYPAL_MERCHANT_EMAIL } } : {}),
            items: [{
                name: 'DemFixIt confirmation fee',
                description,
                quantity: '1',
                unit_amount: { currency_code: 'USD', value: amount },
            }],
        },
        { headers: { ...h, 'PayPal-Request-Id': ref }, timeout: 20000 }
    );
    const id = draft.data.href.split('/').pop();

    await axios.post(
        `${BASE}/v2/invoicing/invoices/${id}/send`,
        { subject: `DemFixIt invoice ${ref}`, note: 'Thank you for using DemFixIt.', send_to_recipient: false, send_to_invoicer: false },
        { headers: h, timeout: 20000 }
    );

    const inv = await getInvoice(id);
    return { id, link: inv.link };
}

async function getInvoice(id) {
    const token = await accessToken();
    const r = await axios.get(`${BASE}/v2/invoicing/invoices/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 20000,
    });
    const status = r.data.status;
    return {
        status,
        paid: status === 'PAID' || status === 'MARKED_AS_PAID',
        link: r.data.detail?.metadata?.recipient_view_url ?? null,
    };
}

module.exports = { createOrder, captureOrder, createInvoice, getInvoice };