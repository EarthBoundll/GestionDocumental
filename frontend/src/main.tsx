import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import './estilos.css';
import { enrutador } from './rutas';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <RouterProvider router={enrutador} />
  </StrictMode>,
);
