import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Telegraf, Markup } from 'telegraf';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Tesseract from 'tesseract.js';
import Jimp from 'jimp';
import QrCodeReader from 'qrcode-reader';
import fetch from 'node-fetch';

/**
 * Resolve data file paths
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, '../data/vehicles.json');
const DRIVERS_FILE = path.resolve(__dirname, '../data/drivers.json');
const SHIFTS_FILE = path.resolve(__dirname, '../data/shifts.json');

/**
 * Data structures:
 * Vehicle: { id: string, name: string, telegram_chat_id?: number, last_location?: { lat:number, lon:number, ts:number } }
 * Driver: { id: string, firstName: string, surname: string, telegram_chat_id?: number, telegram_username?: string, isActive: boolean }
 * Shift: { id: string, driverId: string, vehicleId: string, startTime: number, endTime?: number, startOdometer: number, endOdometer?: number, vehicleCheck?: object }
 * TelegramSession: { chatId: number, driverId?: string, currentAction?: string, actionData?: object }
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

async function loadDriversFromDisk() {
  try {
    const txt = await fs.readFile(DRIVERS_FILE, 'utf8');
    const arr = JSON.parse(txt || '[]');
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    console.error('Failed to read drivers.json', e);
    return [];
  }
}

async function saveDriversToDisk(map) {
  const arr = Array.from(map.values());
  try {
    await fs.writeFile(DRIVERS_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write drivers.json', e);
  }
}

async function loadShiftsFromDisk() {
  try {
    const txt = await fs.readFile(SHIFTS_FILE, 'utf8');
    const arr = JSON.parse(txt || '[]');
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    console.error('Failed to read shifts.json', e);
    return [];
  }
}

async function saveShiftsToDisk(map) {
  const arr = Array.from(map.values());
  try {
    await fs.writeFile(SHIFTS_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write shifts.json', e);
  }
}

// In-memory maps keyed by id
const vehicles = new Map();
const drivers = new Map();
const shifts = new Map();
const telegramSessions = new Map(); // keyed by chatId

// Load data
const vehicleData = await loadVehiclesFromDisk();
for (const v of vehicleData) vehicles.set(v.id, v);

const driverData = await loadDriversFromDisk();
for (const d of driverData) drivers.set(d.id, d);

const shiftData = await loadShiftsFromDisk();
for (const s of shiftData) shifts.set(s.id, s);

// ----- Utility Functions -----
async function processQRCode(photoUrl) {
  try {
    const image = await Jimp.read(photoUrl);
    const qr = new QrCodeReader();

    return new Promise((resolve, reject) => {
      qr.callback = (err, value) => {
        if (err) {
          reject(err);
        } else {
          resolve(value.result);
        }
      };
      qr.decode(image.bitmap);
    });
  } catch (error) {
    throw new Error('Failed to process QR code: ' + error.message);
  }
}

async function processOdometer(photoUrl) {
  try {
    const { data: { text } } = await Tesseract.recognize(photoUrl, 'eng', {
      logger: () => {} // Suppress logs
    });

    // Extract numbers from OCR text
    const numbers = text.match(/\d+/g);
    if (!numbers || numbers.length === 0) {
      return null;
    }

    // Find the most likely odometer reading (largest number, typically 5-7 digits)
    const potentialReadings = numbers
      .filter(num => num.length >= 3 && num.length <= 7)
      .map(num => parseInt(num))
      .filter(num => num > 0);

    return potentialReadings.length > 0 ? Math.max(...potentialReadings) : null;
  } catch (error) {
    throw new Error('Failed to process odometer: ' + error.message);
  }
}

function generateShiftId() {
  return 'shift_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function getDriverByChatId(chatId) {
  for (const [id, driver] of drivers.entries()) {
    if (driver.telegram_chat_id === chatId) {
      return { id, ...driver };
    }
  }
  return null;
}

function getActiveShiftForDriver(driverId) {
  for (const [id, shift] of shifts.entries()) {
    if (shift.driverId === driverId && !shift.endTime) {
      return { id, ...shift };
    }
  }
  return null;
}

// ----- Telegram Bot -----
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const botUser = process.env.BOT_USERNAME; // without the @
if (!botToken || !botUser) {
  console.error('Missing TELEGRAM_BOT_TOKEN or BOT_USERNAME in .env');
  // We do NOT exit here; HTTP API can still serve, but bot won’t work.
}
const bot = botToken ? new Telegraf(botToken) : null;

// Enhanced bot commands for driver operations
if (bot) {
  // Driver registration: /start driver_<driverId>
  bot.start(async (ctx) => {
    const arg = ctx.startPayload || '';
    const chatId = ctx.chat.id;
    const username = ctx.from.username;

    // Check for vehicle deep link (legacy)
    const vehicleMatch = arg.match(/^vehicle_(.+)$/);
    if (vehicleMatch) {
      const vehicleId = vehicleMatch[1];
      const v = vehicles.get(vehicleId) || { id: vehicleId, name: vehicleId };
      v.telegram_chat_id = chatId;
      vehicles.set(vehicleId, v);
      await saveVehiclesToDisk(vehicles);
      return ctx.reply(`✅ Vehicle linked: ${vehicleId}`);
    }

    // Check for driver deep link
    const driverMatch = arg.match(/^driver_(.+)$/);
    if (driverMatch) {
      const driverId = driverMatch[1];
      const driver = drivers.get(driverId);

      if (!driver) {
        return ctx.reply('❌ Driver not found. Please contact your administrator.');
      }

      driver.telegram_chat_id = chatId;
      if (username) driver.telegram_username = username;
      drivers.set(driverId, driver);
      await saveDriversToDisk(drivers);

      return ctx.reply(
        `🚗 Welcome ${driver.firstName} ${driver.surname}!\n\n` +
        `Your Telegram account is now linked to FleetWise.\n\n` +
        `Available commands:\n` +
        `/scan - Scan vehicle QR code to start shift\n` +
        `/status - Check your current shift status\n` +
        `/help - Show all commands`
      );
    }

    // Default start message
    ctx.reply(
      '🚗 Welcome to FleetWise!\n\n' +
      'To get started, your administrator needs to provide you with a registration link.\n\n' +
      'Available commands:\n' +
      '/help - Show available commands'
    );
  });

  // Help command
  bot.help(async (ctx) => {
    const driver = getDriverByChatId(ctx.chat.id);

    if (!driver) {
      return ctx.reply(
        '🆘 Available commands:\n' +
        '/help - Show this help message\n\n' +
        'To access driver features, please ask your administrator for a registration link.'
      );
    }

    const activeShift = getActiveShiftForDriver(driver.id);
    let helpText = `🆘 Available commands:\n\n` +
      `📱 General:\n` +
      `/status - Check shift status\n` +
      `/help - Show this help\n\n`;

    if (!activeShift) {
      helpText += `🚗 Start Shift:\n` +
        `/scan - Scan vehicle QR code\n` +
        `Send photo of QR code for vehicle identification\n\n`;
    } else {
      helpText += `⏹️ End Shift:\n` +
        `/endshift - End current shift\n` +
        `Send odometer photo when ending shift\n\n`;
    }

    helpText += `📍 Location:\n` +
      `Send location to update vehicle position\n\n` +
      `📊 Vehicle Check:\n` +
      `Complete pre-shift inspections when starting`;

    ctx.reply(helpText);
  });

  // Status command
  bot.command('status', async (ctx) => {
    const driver = getDriverByChatId(ctx.chat.id);

    if (!driver) {
      return ctx.reply('❌ You are not registered. Please contact your administrator.');
    }

    const activeShift = getActiveShiftForDriver(driver.id);

    if (!activeShift) {
      return ctx.reply(
        `📊 Status: Off duty\n\n` +
        `Driver: ${driver.firstName} ${driver.surname}\n` +
        `Use /scan to start a shift by scanning a vehicle QR code.`
      );
    }

    const vehicle = vehicles.get(activeShift.vehicleId);
    const startTime = new Date(activeShift.startTime);
    const duration = Math.floor((Date.now() - activeShift.startTime) / (1000 * 60));

    ctx.reply(
      `📊 Status: On duty\n\n` +
      `Driver: ${driver.firstName} ${driver.surname}\n` +
      `Vehicle: ${vehicle?.name || activeShift.vehicleId}\n` +
      `Start time: ${startTime.toLocaleString()}\n` +
      `Duration: ${Math.floor(duration / 60)}h ${duration % 60}m\n` +
      `Start odometer: ${activeShift.startOdometer.toLocaleString()} km\n\n` +
      `Use /endshift to end your shift.`
    );
  });

  // Scan command to start QR scanning process
  bot.command('scan', async (ctx) => {
    const driver = getDriverByChatId(ctx.chat.id);

    if (!driver) {
      return ctx.reply('❌ You are not registered. Please contact your administrator.');
    }

    const activeShift = getActiveShiftForDriver(driver.id);
    if (activeShift) {
      return ctx.reply('❌ You already have an active shift. Use /endshift to end it first.');
    }

    telegramSessions.set(ctx.chat.id, {
      chatId: ctx.chat.id,
      driverId: driver.id,
      currentAction: 'scanning_qr',
      actionData: {}
    });

    ctx.reply(
      '📱 Ready to scan vehicle QR code\n\n' +
      'Please take a photo of the vehicle QR code and send it to me.\n' +
      'I will automatically detect and process the QR code.',
      Markup.keyboard([['❌ Cancel']])
        .oneTime()
        .resize()
    );
  });

  // End shift command
  bot.command('endshift', async (ctx) => {
    const driver = getDriverByChatId(ctx.chat.id);

    if (!driver) {
      return ctx.reply('❌ You are not registered. Please contact your administrator.');
    }

    const activeShift = getActiveShiftForDriver(driver.id);
    if (!activeShift) {
      return ctx.reply('❌ You don\'t have an active shift to end.');
    }

    telegramSessions.set(ctx.chat.id, {
      chatId: ctx.chat.id,
      driverId: driver.id,
      currentAction: 'ending_shift',
      actionData: { shiftId: activeShift.id }
    });

    ctx.reply(
      '📸 Please send a photo of the vehicle odometer\n\n' +
      'I will try to read the odometer automatically, but you can also type the reading manually.',
      Markup.keyboard([['❌ Cancel']])
        .oneTime()
        .resize()
    );
  });

  // Handle photo messages
  bot.on('photo', async (ctx) => {
    const session = telegramSessions.get(ctx.chat.id);
    if (!session) {
      return ctx.reply('Please use a command first (/scan or /endshift)');
    }

    try {
      // Get the highest resolution photo
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const file = await ctx.telegram.getFile(photo.file_id);
      const photoUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;

      await ctx.reply('🔄 Processing image...');

      if (session.currentAction === 'scanning_qr') {
        // Process QR code
        try {
          const qrResult = await processQRCode(photoUrl);
          const vehicleId = qrResult;

          const vehicle = vehicles.get(vehicleId);
          if (!vehicle) {
            return ctx.reply('❌ Vehicle not found. Please check the QR code.');
          }

          // Start vehicle check process
          session.currentAction = 'vehicle_check';
          session.actionData = { vehicleId, checkStep: 0 };
          telegramSessions.set(ctx.chat.id, session);

          await startVehicleCheck(ctx, vehicleId);

        } catch (error) {
          ctx.reply('❌ Could not read QR code. Please try again or ensure the QR code is clearly visible.');
        }

      } else if (session.currentAction === 'ending_shift') {
        // Process odometer reading
        try {
          const odometerReading = await processOdometer(photoUrl);

          if (odometerReading) {
            session.actionData.suggestedOdometer = odometerReading;
            ctx.reply(
              `📊 Detected odometer reading: ${odometerReading.toLocaleString()} km\n\n` +
              `Is this correct?`,
              Markup.keyboard([
                [`✅ Yes, ${odometerReading.toLocaleString()} km`],
                ['✏️ Enter manually'],
                ['❌ Cancel']
              ])
                .oneTime()
                .resize()
            );
          } else {
            ctx.reply(
              '❌ Could not read odometer automatically.\n\n' +
              'Please type the odometer reading manually (numbers only):',
              Markup.keyboard([['❌ Cancel']])
                .oneTime()
                .resize()
            );
            session.currentAction = 'manual_odometer';
            telegramSessions.set(ctx.chat.id, session);
          }

        } catch (error) {
          ctx.reply('❌ Could not process odometer image. Please type the reading manually.');
          session.currentAction = 'manual_odometer';
          telegramSessions.set(ctx.chat.id, session);
        }

      } else if (session.currentAction === 'start_odometer') {
        // Process starting odometer reading
        try {
          const odometerReading = await processOdometer(photoUrl);

          if (odometerReading) {
            session.actionData.suggestedStartOdometer = odometerReading;
            ctx.reply(
              `📊 Detected starting odometer: ${odometerReading.toLocaleString()} km\n\n` +
              `Is this correct?`,
              Markup.keyboard([
                [`✅ Yes, start shift`],
                ['✏️ Enter manually'],
                ['❌ Cancel']
              ])
                .oneTime()
                .resize()
            );
          } else {
            ctx.reply(
              '❌ Could not read odometer automatically.\n\n' +
              'Please type the starting odometer reading manually:',
              Markup.keyboard([['❌ Cancel']])
                .oneTime()
                .resize()
            );
            session.currentAction = 'manual_start_odometer';
            telegramSessions.set(ctx.chat.id, session);
          }

        } catch (error) {
          ctx.reply('❌ Could not process odometer image. Please type the reading manually.');
          session.currentAction = 'manual_start_odometer';
          telegramSessions.set(ctx.chat.id, session);
        }
      }

    } catch (error) {
      console.error('Photo processing error:', error);
      ctx.reply('❌ Error processing image. Please try again.');
    }
  });

  // Handle text messages
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const session = telegramSessions.get(ctx.chat.id);

    // Handle cancel
    if (text === '❌ Cancel') {
      telegramSessions.delete(ctx.chat.id);
      return ctx.reply(
        '❌ Operation cancelled.',
        Markup.removeKeyboard()
      );
    }

    if (!session) return;

    if (session.currentAction === 'manual_odometer') {
      // Handle manual odometer input
      const odometer = parseInt(text.replace(/\D/g, ''));
      if (isNaN(odometer) || odometer <= 0) {
        return ctx.reply('❌ Please enter a valid odometer reading (numbers only):');
      }

      await endShift(ctx, session.actionData.shiftId, odometer);
      telegramSessions.delete(ctx.chat.id);

    } else if (session.currentAction === 'ending_shift' && text.startsWith('✅ Yes,')) {
      // Confirmed OCR reading
      const odometer = session.actionData.suggestedOdometer;
      await endShift(ctx, session.actionData.shiftId, odometer);
      telegramSessions.delete(ctx.chat.id);

    } else if (session.currentAction === 'ending_shift' && text === '✏️ Enter manually') {
      // Switch to manual entry
      session.currentAction = 'manual_odometer';
      telegramSessions.set(ctx.chat.id, session);
      ctx.reply(
        'Please type the odometer reading (numbers only):',
        Markup.keyboard([['❌ Cancel']])
          .oneTime()
          .resize()
      );

    } else if (session.currentAction === 'manual_start_odometer') {
      // Handle manual starting odometer input
      const odometer = parseInt(text.replace(/\D/g, ''));
      if (isNaN(odometer) || odometer <= 0) {
        return ctx.reply('❌ Please enter a valid odometer reading (numbers only):');
      }

      await startShift(ctx, session.actionData.vehicleId, odometer, session.actionData.vehicleCheckResults);

    } else if (session.currentAction === 'start_odometer' && text === '✅ Yes, start shift') {
      // Confirmed OCR reading for starting odometer
      const odometer = session.actionData.suggestedStartOdometer;
      await startShift(ctx, session.actionData.vehicleId, odometer, session.actionData.vehicleCheckResults);

    } else if (session.currentAction === 'start_odometer' && text === '✏️ Enter manually') {
      // Switch to manual entry for starting odometer
      session.currentAction = 'manual_start_odometer';
      telegramSessions.set(ctx.chat.id, session);
      ctx.reply(
        'Please type the starting odometer reading (numbers only):',
        Markup.keyboard([['❌ Cancel']])
          .oneTime()
          .resize()
      );

    } else if (session.currentAction === 'vehicle_check') {
      await handleVehicleCheckResponse(ctx, text);
    }
  });

  // Handle location updates
  bot.on('location', async (ctx) => {
    const driver = getDriverByChatId(ctx.chat.id);
    if (!driver) {
      return ctx.reply('❌ You are not registered. Please contact your administrator.');
    }

    const activeShift = getActiveShiftForDriver(driver.id);
    if (!activeShift) {
      return ctx.reply('📍 Location received, but you don\'t have an active shift.');
    }

    const vehicle = vehicles.get(activeShift.vehicleId);
    if (vehicle) {
      const { latitude, longitude } = ctx.message.location;
      vehicle.last_location = { lat: latitude, lon: longitude, ts: Date.now() };
      vehicles.set(activeShift.vehicleId, vehicle);
      await saveVehiclesToDisk(vehicles);

      ctx.reply(`📍 Location updated for ${vehicle.name || activeShift.vehicleId} ✅`);
    }
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

// ----- Vehicle Check System -----
const vehicleCheckQuestions = [
  { id: 'exterior', question: '🚗 External condition: Any damage, scratches, or issues?', options: ['✅ All good', '⚠️ Minor issues', '❌ Major problems'] },
  { id: 'interior', question: '🪑 Interior condition: Seats, dashboard, cleanliness?', options: ['✅ Clean & good', '⚠️ Needs attention', '❌ Poor condition'] },
  { id: 'tires', question: '🛞 Tire condition: Check for wear, pressure, damage?', options: ['✅ All good', '⚠️ Minor issues', '❌ Needs service'] },
  { id: 'lights', question: '💡 Lights: Headlights, indicators, brake lights working?', options: ['✅ All working', '⚠️ Some issues', '❌ Not working'] },
  { id: 'fluids', question: '🛢️ Fluid levels: Oil, coolant, brake fluid visible levels?', options: ['✅ Levels good', '⚠️ Low levels', '❌ Very low'] },
  { id: 'fuel', question: '⛽ Fuel level: Current fuel/charge level?', options: ['✅ Full/High', '⚠️ Medium', '❌ Low/Empty'] }
];

async function startVehicleCheck(ctx, vehicleId) {
  const vehicle = vehicles.get(vehicleId);
  const session = telegramSessions.get(ctx.chat.id);

  session.actionData.vehicleCheckResults = {};
  session.actionData.checkStep = 0;

  await ctx.reply(
    `🚗 Starting vehicle check for ${vehicle.name || vehicleId}\n\n` +
    `Please complete this pre-shift inspection by answering a few questions.`,
    Markup.removeKeyboard()
  );

  await askNextVehicleCheckQuestion(ctx);
}

async function askNextVehicleCheckQuestion(ctx) {
  const session = telegramSessions.get(ctx.chat.id);
  const stepIndex = session.actionData.checkStep;

  if (stepIndex >= vehicleCheckQuestions.length) {
    return await completeVehicleCheck(ctx);
  }

  const question = vehicleCheckQuestions[stepIndex];

  await ctx.reply(
    `${stepIndex + 1}/${vehicleCheckQuestions.length} - ${question.question}`,
    Markup.keyboard([
      question.options,
      ['❌ Cancel']
    ])
      .oneTime()
      .resize()
  );
}

async function handleVehicleCheckResponse(ctx, response) {
  const session = telegramSessions.get(ctx.chat.id);
  const stepIndex = session.actionData.checkStep;
  const question = vehicleCheckQuestions[stepIndex];

  if (!question.options.includes(response)) {
    return ctx.reply('Please select one of the provided options.');
  }

  // Store the response
  session.actionData.vehicleCheckResults[question.id] = response;
  session.actionData.checkStep++;
  telegramSessions.set(ctx.chat.id, session);

  await askNextVehicleCheckQuestion(ctx);
}

async function completeVehicleCheck(ctx) {
  const session = telegramSessions.get(ctx.chat.id);
  const { vehicleId, vehicleCheckResults } = session.actionData;

  // Ask for starting odometer
  session.currentAction = 'start_odometer';
  telegramSessions.set(ctx.chat.id, session);

  await ctx.reply(
    '📊 Vehicle check completed!\n\n' +
    '📸 Now please send a photo of the odometer to record the starting reading.',
    Markup.keyboard([['❌ Cancel']])
      .oneTime()
      .resize()
  );
}

async function startShift(ctx, vehicleId, startOdometer, vehicleCheckResults) {
  const session = telegramSessions.get(ctx.chat.id);
  const driverId = session.driverId;
  const shiftId = generateShiftId();

  const newShift = {
    id: shiftId,
    driverId: driverId,
    vehicleId: vehicleId,
    startTime: Date.now(),
    startOdometer: startOdometer,
    vehicleCheck: vehicleCheckResults
  };

  shifts.set(shiftId, newShift);
  await saveShiftsToDisk(shifts);

  const driver = drivers.get(driverId);
  const vehicle = vehicles.get(vehicleId);

  await ctx.reply(
    `✅ Shift started successfully!\n\n` +
    `Driver: ${driver.firstName} ${driver.surname}\n` +
    `Vehicle: ${vehicle.name || vehicleId}\n` +
    `Start time: ${new Date().toLocaleString()}\n` +
    `Start odometer: ${startOdometer.toLocaleString()} km\n\n` +
    `Use /status to check your shift or /endshift when done.\n` +
    `You can also send your location to update vehicle position.`,
    Markup.removeKeyboard()
  );

  telegramSessions.delete(ctx.chat.id);
}

async function endShift(ctx, shiftId, endOdometer) {
  const shift = shifts.get(shiftId);
  if (!shift) {
    return ctx.reply('❌ Shift not found.');
  }

  shift.endTime = Date.now();
  shift.endOdometer = endOdometer;
  shifts.set(shiftId, shift);
  await saveShiftsToDisk(shifts);

  const driver = drivers.get(shift.driverId);
  const vehicle = vehicles.get(shift.vehicleId);
  const duration = Math.floor((shift.endTime - shift.startTime) / (1000 * 60));
  const distance = endOdometer - shift.startOdometer;

  await ctx.reply(
    `✅ Shift ended successfully!\n\n` +
    `Driver: ${driver.firstName} ${driver.surname}\n` +
    `Vehicle: ${vehicle.name || shift.vehicleId}\n` +
    `Duration: ${Math.floor(duration / 60)}h ${duration % 60}m\n` +
    `Distance: ${distance.toLocaleString()} km\n` +
    `Start: ${shift.startOdometer.toLocaleString()} km\n` +
    `End: ${endOdometer.toLocaleString()} km\n\n` +
    `Thank you for using FleetWise!`,
    Markup.removeKeyboard()
  );
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

// Driver management
app.get('/api/drivers', (_req, res) => {
  const arr = Array.from(drivers.values()).map((d) => ({
    id: d.id,
    firstName: d.firstName,
    surname: d.surname,
    isActive: d.isActive,
    hasTelegram: !!d.telegram_chat_id,
    telegram_username: d.telegram_username
  }));
  res.json(arr);
});

app.post('/api/drivers', async (req, res) => {
  const { id, firstName, surname } = req.body || {};
  if (!id || !firstName || !surname) return res.status(400).json({ error: 'id, firstName and surname are required' });
  if (drivers.has(id)) return res.status(409).json({ error: 'Driver already exists' });
  drivers.set(id, { id, firstName, surname, isActive: true });
  await saveDriversToDisk(drivers);
  res.status(201).json({ ok: true });
});

// Driver Telegram registration link
app.get('/api/drivers/:id/telegram-link', (req, res) => {
  const driverId = req.params.id;
  if (!botUser) return res.status(503).json({ error: 'Bot username not configured' });
  const url = `https://t.me/${botUser}?start=driver_${encodeURIComponent(driverId)}`;
  res.json({ url });
});

// Shift management
app.get('/api/shifts', (_req, res) => {
  const arr = Array.from(shifts.values()).map((s) => {
    const driver = drivers.get(s.driverId);
    const vehicle = vehicles.get(s.vehicleId);
    return {
      ...s,
      driverName: driver ? `${driver.firstName} ${driver.surname}` : 'Unknown',
      vehicleName: vehicle ? vehicle.name : s.vehicleId
    };
  });
  res.json(arr);
});

app.get('/api/shifts/active', (_req, res) => {
  const activeShifts = [];
  for (const [id, shift] of shifts.entries()) {
    if (!shift.endTime) {
      const driver = drivers.get(shift.driverId);
      const vehicle = vehicles.get(shift.vehicleId);
      activeShifts.push({
        ...shift,
        driverName: driver ? `${driver.firstName} ${driver.surname}` : 'Unknown',
        vehicleName: vehicle ? vehicle.name : shift.vehicleId
      });
    }
  }
  res.json(activeShifts);
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
