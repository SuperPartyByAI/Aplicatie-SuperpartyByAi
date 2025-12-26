import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Cleanup după fiecare test
afterEach(() => {
  cleanup();
});
