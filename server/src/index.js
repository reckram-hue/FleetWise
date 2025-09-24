import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Telegraf } from 'telegraf';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Resolve data file path (server/data/vehicles.json)
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, '../data/vehicles.json');

/**
 * Vehicle record shape:
 * {
 *   id: string,
 *   name: string,
 *   telegram_chat_id?: number,
 *   last_location?: { lat:number, lon:number, ts:number }
 * }
 */

// ----- Load & Save (persistence) -----
async function loadVehiclesFromDisk() {
  try {
    const txt = await fs.readFile(DATA_FILE, 'utf8');
    const arr = JSON.parse(txt || '[]');
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    console.error('Failed to read vehicles.json', e);
    return [];
  }
}

async function saveVehiclesToDisk(map) {
  const arr = Array.from(map.values());
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write vehicles.json', e);
  }
}

// In-memory map keyed by id
const vehicles = new Map();
const preload = await loadVehiclesFromDisk();
for (const v of preload) vehicles.set(v.id, v);

// ----- Telegram Bot -----
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const botUser = process.env.BOT_USERNAME; // without the @
if (!botToken || !botUser) {
  console.error('Missing TELEGRAM_BOT_TOKEN or BOT_USERNAME in .env');
  // We do NOT exit here; HTTP API can still serve, but bot won’t work.
}
const bot = botToken ? new Telegraf(botToken) : null;

// Deep link: /start vehicle_<vehicleId>
if (bot) {
  bot.start(async (ctx) => {
    const arg = ctx.startPayload || '';
    const m = arg.match(/^vehicle_(.+)$/);
    if (!m) {
      return ctx.reply('Welcome to FleetWise bot. This chat is not linked yet. Use a vehicle link from Admin.');
    }
    const vehicleId = m[1];

    // Ensure record exists
    const v = vehicles.get(vehicleId) || { id: vehicleId, name: vehicleId };
    v.telegram_chat_id = ctx.chat.id;
    vehicles.set(vehicleId, v);
    await saveVehiclesToDisk(vehicles);

    await ctx.reply(`Linked ✅ This chat is now bound to vehicle: ${vehicleId}`);
  });

  // Optional helper
  bot.command('where', (ctx) => {
    ctx.reply('Please send your current location (paperclip ➜ Location).');
  });

  // When the vehicle chat sends a location, record it
  bot.on('location', async (ctx) => {
    const chatId = ctx.chat.id;
    // Find vehicle by chat
    let entry;
    for (const [id, v] of vehicles.entries()) {
      if (v.telegram_chat_id === chatId) {
        entry = [id, v];
        break;
      }
    }
    if (!entry) return ctx.reply('This chat isn’t linked to a vehicle yet. Use the deep link from Admin.');

    const [vehicleId, v] = entry;
    const { latitude, longitude } = ctx.message.location;
    v.last_location = { lat: latitude, lon: longitude, ts: Date.now() };
    vehicles.set(vehicleId, v);
    await saveVehiclesToDisk(vehicles);

    await ctx.reply(`Location received for ${vehicleId} ✅`);
  });

  // Start bot (long polling)
  bot.launch()
    .then(() => console.log('Telegram bot started'))
    .catch((e) => {
      console.error('Bot launch failed', e);
    });

  // Graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

// ----- HTTP API -----
const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

// List vehicles
app.get('/api/vehicles', (_req, res) => {
  const arr = Array.from(vehicles.values()).map((v) => ({
    id: v.id,
    name: v.name,
    hasTelegram: !!v.telegram_chat_id,
    last_location: v.last_location || null,
  }));
  res.json(arr);
});

// Add a vehicle { id, name }
app.post('/api/vehicles', async (req, res) => {
  const { id, name } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: 'id and name are required' });
  if (vehicles.has(id)) return res.status(409).json({ error: 'Vehicle already exists' });
  vehicles.set(id, { id, name });
  await saveVehiclesToDisk(vehicles);
  res.status(201).json({ ok: true });
});

// Update vehicle name
app.patch('/api/vehicles/:id', async (req, res) => {
  const id = req.params.id;
  const { name } = req.body || {};
  const v = vehicles.get(id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  if (typeof name === 'string' && name.trim()) v.name = name.trim();
  vehicles.set(id, v);
  await saveVehiclesToDisk(vehicles);
  res.json({ ok: true });
});

// Deep link (bind link)
app.get('/api/vehicles/:id/telegram-link', (req, res) => {
  const vehicleId = req.params.id;
  if (!botUser) return res.status(503).json({ error: 'Bot username not configured' });
  const url = `https://t.me/${botUser}?start=vehicle_${encodeURIComponent(vehicleId)}`;
  res.json({ url });
});

// Latest location
app.get('/api/vehicles/:id/location', (req, res) => {
  const v = vehicles.get(req.params.id);
  if (!v?.last_location) return res.status(404).json({ error: 'No location yet' });
  res.json(v.last_location);
});

// Dispatch (send Telegram message)
app.post('/api/vehicles/:id/dispatch', async (req, res) => {
  if (!bot) return res.status(503).json({ error: 'Bot not running' });
  const { message } = req.body || {};
  const v = vehicles.get(req.params.id);
  if (!v?.telegram_chat_id) return res.status(404).json({ error: 'Vehicle not linked to Telegram' });
  try {
    await bot.telegram.sendMessage(v.telegram_chat_id, `🚚 Dispatch:\n${message || 'New job'}`);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to send dispatch' });
  }
});

const port = Number(process.env.PORT ?? 5174);
app.listen(port, () => console.log(`FleetWise server listening on http://localhost:${port}`));
