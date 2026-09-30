import type { Surface } from '../sim/dims.ts';
import type { SkyName } from './Sky.ts';

/** a stadium's identity: surface and its paint, seats, walls, one accent */
export interface Venue {
  id: string;
  name: string;
  city: string;
  surface: Surface;
  courtIn: string;
  courtOut: string;
  line: string;
  dirt: string;
  seat: string;
  seatAlt: string;
  wall: string;
  wallInk: string;
  accent: string;
  concrete: string;
  sky: SkyName;
}

export const VENUES: Record<string, Venue> = {
  harbour: {
    id: 'harbour', name: 'Harbour Park Arena', city: 'New Haven Bay', surface: 'hard',
    courtIn: '#3b69a0', courtOut: '#51804f', line: '#ececea', dirt: '#6a5a48',
    seat: '#2b4f95', seatAlt: '#315aa6', wall: '#172448', wallInk: '#e9edf5', accent: '#f2c230', concrete: '#b9b5ae',
    sky: 'day',
  },
  porte: {
    id: 'porte', name: 'Stade de la Porte Dorée', city: 'Paris', surface: 'clay',
    courtIn: '#b95d37', courtOut: '#b95d37', line: '#efece6', dirt: '#9c4a2a',
    seat: '#23522f', seatAlt: '#2c6139', wall: '#1d4428', wallInk: '#f1ede4', accent: '#e8702f', concrete: '#9a948b',
    sky: 'sunset',
  },
  kings: {
    id: 'kings', name: 'Kingsbridge Centre Court', city: 'London', surface: 'grass',
    courtIn: '#3f7a2c', courtOut: '#3f7a2c', line: '#f0f0ea', dirt: '#8a7457',
    seat: '#1c3a28', seatAlt: '#224532', wall: '#173222', wallInk: '#efeee6', accent: '#5b3b86', concrete: '#8f8b84',
    sky: 'overcast',
  },
};
