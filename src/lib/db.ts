import Dexie, { type Table } from 'dexie';
import type { Spectrum } from '../types/spectrum';

interface StoredSpectrum extends Omit<Spectrum, 'wavelengths' | 'intensities'> {
  wavelengths: number[];
  intensities: number[];
}

class SpectraDB extends Dexie {
  spectra!: Table<StoredSpectrum, string>;

  constructor() {
    super('SpectraViewDB');
    this.version(1).stores({
      spectra: 'id, filename, format',
    });
  }
}

const db = new SpectraDB();

export async function saveSpectra(spectra: Spectrum[]): Promise<void> {
  await db.spectra.bulkPut(spectra as StoredSpectrum[]);
}

export async function removeSpectrumFromDB(id: string): Promise<void> {
  await db.spectra.delete(id);
}

export async function loadAllSpectra(): Promise<Spectrum[]> {
  const rows = await db.spectra.toArray();
  return rows as Spectrum[];
}

export async function clearDB(): Promise<void> {
  await db.spectra.clear();
}
