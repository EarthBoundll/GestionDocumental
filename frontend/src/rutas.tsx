import { createBrowserRouter, Outlet, type RouteObject } from 'react-router';
import { Layout } from './layout/Layout';
import { Categorias } from './paginas/admin/Categorias';
import { Historial } from './paginas/admin/Historial';
import { Identidad } from './paginas/admin/Identidad';
import { Papelera } from './paginas/admin/Papelera';
import { Tablero } from './paginas/admin/Tablero';
import { Usuarios } from './paginas/admin/Usuarios';
import { IniciarSesion } from './paginas/auth/IniciarSesion';
import { RecuperarClave } from './paginas/auth/RecuperarClave';
import { RestablecerClave } from './paginas/auth/RestablecerClave';
import { MiCuenta } from './paginas/cuenta/MiCuenta';
import { DetalleDocumento } from './paginas/documentos/DetalleDocumento';
import { ListaDocumentos } from './paginas/documentos/ListaDocumentos';
import { SubirDocumento } from './paginas/documentos/SubirDocumento';
import { NoEncontrado } from './paginas/errores/NoEncontrado';
import { Notificaciones } from './paginas/notificaciones/Notificaciones';
import { Auditoria } from './paginas/plataforma/Auditoria';
import { DetalleEmpresa } from './paginas/plataforma/DetalleEmpresa';
import { NuevaEmpresa } from './paginas/plataforma/NuevaEmpresa';
import { Respaldos } from './paginas/plataforma/Respaldos';
import { Resumen } from './paginas/plataforma/Resumen';
import { Solicitudes } from './paginas/solicitudes/Solicitudes';
import { Inicio, RutaConSesion, RutaSinSesion } from './sesion/Rutas';
import { SesionProvider } from './sesion/SesionContext';

/** El mapa de pantallas de docs/04-api.md §6. Se exporta para probarlo con un enrutador en memoria. */
export const rutas: RouteObject[] = [
  {
    element: (
      <SesionProvider>
        <Outlet />
      </SesionProvider>
    ),
    children: [
      {
        element: <RutaSinSesion />,
        children: [
          { path: '/login', element: <IniciarSesion /> },
          { path: '/recuperar-clave', element: <RecuperarClave /> },
        ],
      },
      // El enlace del correo se abre con o sin sesión: definir la contraseña cierra todas las sesiones.
      { path: '/restablecer-clave', element: <RestablecerClave /> },
      {
        element: <RutaConSesion />,
        children: [
          {
            element: <Layout />,
            children: [
              { path: '/', element: <Inicio /> },
              { path: '/documentos', element: <ListaDocumentos /> },
              { path: '/documentos/nuevo', element: <SubirDocumento /> },
              { path: '/documentos/:id', element: <DetalleDocumento /> },
              { path: '/solicitudes', element: <Solicitudes /> },
              { path: '/notificaciones', element: <Notificaciones /> },
              { path: '/cuenta', element: <MiCuenta /> },
              { path: '/admin/tablero', element: <Tablero /> },
              { path: '/admin/usuarios', element: <Usuarios /> },
              { path: '/admin/categorias', element: <Categorias /> },
              { path: '/admin/historial', element: <Historial /> },
              { path: '/admin/papelera', element: <Papelera /> },
              { path: '/admin/identidad', element: <Identidad /> },
              { path: '/plataforma', element: <Resumen /> },
              { path: '/plataforma/auditoria', element: <Auditoria /> },
              { path: '/plataforma/respaldos', element: <Respaldos /> },
              { path: '/plataforma/empresas/nueva', element: <NuevaEmpresa /> },
              { path: '/plataforma/empresas/:id', element: <DetalleEmpresa /> },
              { path: '*', element: <NoEncontrado /> },
            ],
          },
        ],
      },
    ],
  },
];

export const enrutador = createBrowserRouter(rutas);
