import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom no desplaza la página: basta con que el método exista.
Element.prototype.scrollIntoView ??= () => {};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
