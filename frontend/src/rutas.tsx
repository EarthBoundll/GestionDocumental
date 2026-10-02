import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router';
import { Layout } from './layout/Layout';
import { Categorias } from './paginas/admin/Categorias';
import { Historial } from './paginas/admin/Historial';
import { Usuarios } from './paginas/admin/Usuarios';
import { IniciarSesion } from './paginas/auth/IniciarSesion';
import { RegistrarOrganizacion } from './paginas/auth/RegistrarOrganizacion';
import { MiCuenta } from './paginas/cuenta/MiCuenta';
import { DetalleDocumento } from './paginas/documentos/DetalleDocumento';
import { ListaDocumentos } from './paginas/documentos/ListaDocumentos';
import { SubirDocumento } from './paginas/documentos/SubirDocumento';
import { NoEncontrado } from './paginas/errores/NoEncontrado';
import { Notificaciones } from './paginas/notificaciones/Notificaciones';
import { Solicitudes } from './paginas/solicitudes/Solicitudes';
import { RutaConSesion, RutaSinSesion } from './sesion/Rutas';
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
          { path: '/registro', element: <RegistrarOrganizacion /> },
        ],
      },
      {
        element: <RutaConSesion />,
        children: [
          {
            element: <Layout />,
            children: [
              { path: '/', element: <Navigate to="/documentos" replace /> },
              { path: '/documentos', element: <ListaDocumentos /> },
              { path: '/documentos/nuevo', element: <SubirDocumento /> },
              { path: '/documentos/:id', element: <DetalleDocumento /> },
              { path: '/solicitudes', element: <Solicitudes /> },
              { path: '/notificaciones', element: <Notificaciones /> },
              { path: '/cuenta', element: <MiCuenta /> },
              { path: '/admin/usuarios', element: <Usuarios /> },
              { path: '/admin/categorias', element: <Categorias /> },
              { path: '/admin/historial', element: <Historial /> },
              { path: '*', element: <NoEncontrado /> },
            ],
          },
        ],
      },
    ],
  },
];

export const enrutador = createBrowserRouter(rutas);
