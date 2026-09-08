import React, { useState, useEffect } from 'react';
import { MessageCircle, RefreshCw, Copy } from 'lucide-react';
import Card from '../shared/Card';
import Header from '../shared/Header';

interface TelegramDriver {
  id: string;
  firstName: string;
  surname: string;
  isActive: boolean;
  hasTelegram: boolean;
  telegram_username?: string;
}

interface TelegramDriversProps {
  onBack: () => void;
}

const TelegramDrivers: React.FC<TelegramDriversProps> = ({ onBack }) => <div><Header title="Telegram Integration" /><Card>
  <h2>Telegram integration is deferred</h2><p>This integration is not available in this release.</p>
  <button className="min-h-11 underline" onClick={onBack}>Back to Dashboard</button>
</Card></div>;
export default TelegramDrivers;
