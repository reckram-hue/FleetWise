// Real API service to connect to the backend server
const API_BASE_URL = 'http://localhost:3001/api';

export const api = {
  // Driver management
  async getDrivers() {
    const response = await fetch(`${API_BASE_URL}/drivers`);
    if (!response.ok) throw new Error('Failed to fetch drivers');
    return response.json();
  },

  async createDriver(driver: any) {
    const response = await fetch(`${API_BASE_URL}/drivers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(driver)
    });
    if (!response.ok) throw new Error('Failed to create driver');
    return response.json();
  },

  async getTelegramLink(driverId: string) {
    const response = await fetch(`${API_BASE_URL}/drivers/${driverId}/telegram-link`);
    if (!response.ok) throw new Error('Failed to get Telegram link');
    return response.json();
  },

  // Vehicle management
  async getVehicles() {
    const response = await fetch(`${API_BASE_URL}/vehicles`);
    if (!response.ok) throw new Error('Failed to fetch vehicles');
    return response.json();
  },

  async createVehicle(vehicle: any) {
    const response = await fetch(`${API_BASE_URL}/vehicles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vehicle)
    });
    if (!response.ok) throw new Error('Failed to create vehicle');
    return response.json();
  },

  async updateVehicle(vehicleId: string, vehicle: any) {
    const response = await fetch(`${API_BASE_URL}/vehicles/${vehicleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vehicle)
    });
    if (!response.ok) throw new Error('Failed to update vehicle');
    return response.json();
  },

  // Shift management
  async getShifts() {
    const response = await fetch(`${API_BASE_URL}/shifts`);
    if (!response.ok) throw new Error('Failed to fetch shifts');
    return response.json();
  },

  async getActiveShifts() {
    const response = await fetch(`${API_BASE_URL}/shifts/active`);
    if (!response.ok) throw new Error('Failed to fetch active shifts');
    return response.json();
  },

  // Health check
  async checkHealth() {
    const response = await fetch(`http://localhost:3001/health`);
    if (!response.ok) throw new Error('Server unhealthy');
    return response.json();
  }
};

export default api;