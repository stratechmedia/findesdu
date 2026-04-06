const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Simple file-based lead store (swap for DB later) ──────────────────────
const LEADS_FILE = path.join(__dirname, 'leads.json');

function readLeads() {
  if (!fs.existsSync(LEADS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8')); }
  catch { return []; }
}

function saveLead(lead) {
  const leads = readLeads();
  leads.push(lead);
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

// ── Email transporter ─────────────────────────────────────────────────────
// Set these in Railway environment variables:
//   EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS
//   NOTIFY_EMAIL (where YOU get notified of new leads)
//   FROM_EMAIL (the from address)
function getTransporter() {
  return nodemailer.createTransport({
    host:   process.env.EMAIL_HOST  || 'smtp.gmail.com',
    port:   parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

// ── Provision publisherpact Anseri account for a new lead ─────────────────
async function provisionAnseriAccount(email, domain) {
  const secret = process.env.PUBLISHERPACT_ANSERI_SECRET;
  const baseUrl = process.env.PUBLISHERPACT_URL || 'https://publisherpact.com';
  if (!secret) {
    console.warn('PUBLISHERPACT_ANSERI_SECRET not set — skipping account provision');
    return null;
  }
  try {
    const res = await fetch(`${baseUrl}/api/anseri-signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, domain, secret }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (data.ok) {
      console.log(`Anseri account provisioned for ${email} → ${data.redirectUrl}`);
      return data.redirectUrl;
    } else {
      console.error('Anseri provision failed:', data);
      return null;
    }
  } catch (err) {
    console.error('Anseri provision error:', err.message);
    return null;
  }
}

// ── POST /api/leads ───────────────────────────────────────────────────────
app.post('/api/leads', async (req, res) => {
  const { email, domain, score } = req.body;

  // Basic validation
  if (!email || !email.includes('@')) {
    return res.status(400).json({ ok: false, error: 'Ugyldig email' });
  }

  const lead = {
    email,
    domain: domain || 'ukendt',
    score:  score  || null,
    ts:     new Date().toISOString(),
    ip:     req.headers['x-forwarded-for'] || req.socket.remoteAddress,
  };

  // Save locally
  saveLead(lead);
  console.log('New lead:', lead);

  // Provision publisherpact Anseri account (non-blocking)
  // This creates/invites the user and sends them a magic link to their dashboard
  provisionAnseriAccount(email, lead.domain).catch(() => {});

  // Send emails (non-blocking — don't fail if email is misconfigured)
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    const transporter = getTransporter();
    const from = process.env.FROM_EMAIL || process.env.EMAIL_USER;
    const notifyTo = process.env.NOTIFY_EMAIL || process.env.EMAIL_USER;

    // 1. Notify Susanne
    transporter.sendMail({
      from,
      to: notifyTo,
      subject: `Nyt lead: ${domain || email}`,
      text: [
        `Nyt lead fra findesdu.ai`,
        ``,
        `Email:   ${email}`,
        `Domæne:  ${domain || '—'}`,
        `Score:   ${score || '—'}/100`,
        `Tid:     ${lead.ts}`,
        ``,
        `Alle leads: ${leads_url()}`,
      ].join('\n'),
      html: `
        <div style="font-family:sans-serif;max-width:480px">
          <h2 style="color:#0D1B2A">Nyt lead fra findesdu.ai 🎯</h2>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:8px;color:#556677">Email</td><td style="padding:8px;font-weight:600">${email}</td></tr>
            <tr style="background:#f5f5f5"><td style="padding:8px;color:#556677">Domæne</td><td style="padding:8px;font-weight:600">${domain || '—'}</td></tr>
            <tr><td style="padding:8px;color:#556677">Score</td><td style="padding:8px;font-weight:600">${score || '—'}/100</td></tr>
            <tr style="background:#f5f5f5"><td style="padding:8px;color:#556677">Tid</td><td style="padding:8px">${new Date(lead.ts).toLocaleString('da-DK')}</td></tr>
          </table>
          <br/>
          <a href="https://anseri.ai" style="color:#2A9D8F">Gå til Anseri.ai →</a>
        </div>
      `
    }).catch(err => console.error('Notify email failed:', err));

    // Note: No confirmation email to the lead — Supabase sends the magic link directly.
  } else {
    console.warn('EMAIL_USER/EMAIL_PASS not set — emails skipped');
  }

  res.json({ ok: true });
});

// ── GET /api/leads (simple admin — protect with env var later) ────────────
app.get('/api/leads', (req, res) => {
  const key = req.query.key;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(readLeads());
});

function leads_url() {
  return `${process.env.RAILWAY_PUBLIC_DOMAIN
    ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN
    : 'http://localhost:' + PORT}/api/leads?key=${process.env.ADMIN_KEY || 'sæt-ADMIN_KEY'}`;
}

// ── Serve index.html for all other routes ────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`findesdu.ai kører på port ${PORT}`);
  console.log(`Leads URL: ${leads_url()}`);
});
