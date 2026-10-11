-- 017 · El estilo de cada empresa (RF31, D47) y el tamaño del texto de cada persona (RF32).
--
-- Opciones cerradas, no colores libres: el menú lateral y la barra de arriba van claros o del color de la
-- empresa, que la API ya exige legible con texto blanco encima (D28), y las esquinas, rectas, suaves o
-- redondeadas. Con los valores por defecto, cada empresa que ya existe se sigue viendo como hasta hoy.

alter table empresas
  add column estilo_menu varchar(5) not null default 'claro' check (estilo_menu in ('claro', 'marca')),
  add column estilo_barra varchar(5) not null default 'claro' check (estilo_barra in ('claro', 'marca')),
  add column esquinas varchar(11) not null default 'suaves' check (esquinas in ('rectas', 'suaves', 'redondeadas'));

-- Como el color: la política `identidad` (008) limita la actualización al administrador de la propia empresa;
-- aquí solo se suman las columnas a las que el rol de empresa puede escribir. El Master ya escribe en la tabla.
grant update (estilo_menu, estilo_barra, esquinas) on empresas to app_empresa;

-- El tamaño del texto lo elige cada persona, como su tema (008): no cambia el de nadie más ni pasa por el historial.
alter table usuarios
  add column tamano_texto varchar(10) not null default 'normal' check (tamano_texto in ('normal', 'grande', 'muy_grande'));
