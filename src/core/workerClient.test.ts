import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readIfcSchema } from './workerClient';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('readIfcSchema', () => {
  it('reads the schema of a real IFC file', () => {
    expect(readIfcSchema(new Uint8Array(readFileSync('src/core/fixtures/mini.ifc')))).toBe('IFC4');
  });

  it('accepts IFC2X3 with spaces and a BOM', () => {
    expect(readIfcSchema(bytes("﻿  ISO-10303-21;\nHEADER;\nFILE_SCHEMA (('IFC2X3'));"))).toBe('IFC2X3');
  });

  it('rejects files that are not STEP/IFC', () => {
    expect(readIfcSchema(bytes('%PDF-1.7 ...'))).toBeNull();
    expect(readIfcSchema(bytes('ISO-10303-21;\nHEADER;\nENDSEC;'))).toBeNull();
    expect(readIfcSchema(new Uint8Array())).toBeNull();
  });
});
