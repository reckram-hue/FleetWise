// src/store/shift.ts — FULL DROP-IN shift state management with localStorage persistence

import { Vehicle } from '../types';

// Shift state interface
export interface ActiveShiftState {
  shiftId: string;
  driverId: string;
  driverName: string;
  startAt: string; // ISO date string
  // Shift-level (original) start context — preserved for legacy shifts and shift-start display.
  startOdo?: number;
  startChargePercent?: number;
  // Current VehicleAssignment (absent while no vehicle is assigned to the active shift).
  assignmentId?: string;
  assignmentStartOdo?: number;
  assignmentStartChargePercent?: number;
  // Current/assigned vehicle. May also hold the legacy shift's vehicle as a "continue with"
  // suggestion when the shift has no assignment yet.
  vehicleId?: string;
  vehicle?: {
    id: string;
    registration: string;
    alias?: string;
    vehicleType: 'ICE' | 'EV';
  };
}

// localStorage key
const STORAGE_KEY = 'fleetwise_active_shift';

// State management class
class ShiftStore {
  private listeners: Array<(state: ActiveShiftState | null) => void> = [];
  private currentState: ActiveShiftState | null = null;

  constructor() {
    // Load from localStorage on initialization
    this.loadFromStorage();
  }

  /**
   * Load shift from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.currentState = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load shift from localStorage:', error);
      this.currentState = null;
    }
  }

  /**
   * Save shift to localStorage
   */
  private saveToStorage(): void {
    try {
      if (this.currentState) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentState));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error('Failed to save shift to localStorage:', error);
    }
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentState);
      } catch (error) {
        console.error('Error in shift state listener:', error);
      }
    });
  }

  /**
   * Set active shift state
   */
  setActiveShift(shift: ActiveShiftState): void {
    this.currentState = shift;
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Clear active shift (after ending shift)
   */
  clearActiveShift(): void {
    this.currentState = null;
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Get current active shift
   */
  getActiveShift(): ActiveShiftState | null {
    return this.currentState;
  }

  /**
   * Check if there's an active shift
   */
  hasActiveShift(): boolean {
    return this.currentState !== null;
  }

  /**
   * Subscribe to shift state changes
   * Returns unsubscribe function
   */
  subscribe(listener: (state: ActiveShiftState | null) => void): () => void {
    this.listeners.push(listener);

    // Call listener immediately with current state
    listener(this.currentState);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Update partial shift data (e.g., after updating odometer)
   */
  updateShift(updates: Partial<ActiveShiftState>): void {
    if (this.currentState) {
      this.currentState = {
        ...this.currentState,
        ...updates,
      };
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  /**
   * Attach the current VehicleAssignment (vehicle + its start readings) to the active shift.
   * The work Shift itself stays active; only the assigned-vehicle portion changes.
   */
  setVehicleAssignment(assignment: {
    assignmentId: string;
    vehicleId: string;
    vehicle: NonNullable<ActiveShiftState['vehicle']>;
    startOdo?: number;
    startChargePercent?: number;
  }): void {
    if (!this.currentState) return;
    this.currentState = {
      ...this.currentState,
      assignmentId: assignment.assignmentId,
      vehicleId: assignment.vehicleId,
      vehicle: assignment.vehicle,
      assignmentStartOdo: assignment.startOdo,
      assignmentStartChargePercent: assignment.startChargePercent,
    };
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Clear the current VehicleAssignment while KEEPING the work Shift active.
   * Preserves shiftId/driverId/driverName/startAt/shift-level start readings.
   */
  clearVehicleAssignment(): void {
    if (!this.currentState) return;
    const { shiftId, driverId, driverName, startAt, startOdo, startChargePercent } = this.currentState;
    this.currentState = {
      shiftId,
      driverId,
      driverName,
      startAt,
      startOdo,
      startChargePercent,
    };
    this.saveToStorage();
    this.notifyListeners();
  }
}

// Create singleton instance
export const shiftStore = new ShiftStore();

// React hook for using shift state in components
export function useShiftStore(): {
  activeShift: ActiveShiftState | null;
  hasActiveShift: boolean;
  setActiveShift: (shift: ActiveShiftState) => void;
  clearActiveShift: () => void;
  updateShift: (updates: Partial<ActiveShiftState>) => void;
  setVehicleAssignment: (assignment: {
    assignmentId: string;
    vehicleId: string;
    vehicle: NonNullable<ActiveShiftState['vehicle']>;
    startOdo?: number;
    startChargePercent?: number;
  }) => void;
  clearVehicleAssignment: () => void;
} {
  const [activeShift, setActiveShiftState] = React.useState<ActiveShiftState | null>(
    shiftStore.getActiveShift()
  );

  React.useEffect(() => {
    const unsubscribe = shiftStore.subscribe((state) => {
      setActiveShiftState(state);
    });

    return unsubscribe;
  }, []);

  return {
    activeShift,
    hasActiveShift: activeShift !== null,
    setActiveShift: (shift: ActiveShiftState) => shiftStore.setActiveShift(shift),
    clearActiveShift: () => shiftStore.clearActiveShift(),
    updateShift: (updates: Partial<ActiveShiftState>) => shiftStore.updateShift(updates),
    setVehicleAssignment: (assignment) => shiftStore.setVehicleAssignment(assignment),
    clearVehicleAssignment: () => shiftStore.clearVehicleAssignment(),
  };
}

// Import React for the hook
import React from 'react';

export default shiftStore;
