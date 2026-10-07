import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom no desplaza la página: basta con que el método exista.
Element.prototype.scrollIntoView ??= () => {};

// Ni abre diálogos modales: se imita lo que hace el navegador con el atributo `open` y el evento «close».
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  // El tema y el color se ponen en <html>, que sobrevive entre pruebas.
  delete document.documentElement.dataset.tema;
  document.documentElement.removeAttribute('style');
});
