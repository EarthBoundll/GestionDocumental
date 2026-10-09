-- 012 · El fondo de cada empresa (RF31, D39): un color que tiñe las pantallas y una imagen detrás de ellas.
--
-- Como el resto de la identidad (008): lo cambian su administrador y el Master, y la imagen vive en el
-- almacenamiento privado, en la carpeta de la empresa, con un enlace firmado.

alter table empresas
  -- Solo el tono: la interfaz fija la claridad para el modo claro y el oscuro, así que no hay contraste que validar.
  add column color_fondo char(7) check (color_fondo ~ '^#[0-9a-f]{6}$'),
  -- WebP o JPG: el navegador la comprime antes de subirla.
  add column fondo_ruta varchar(255) check (fondo_ruta ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'),
  add constraint empresas_fondo_en_su_carpeta check (starts_with(fondo_ruta, id::text || '/'));

-- La política `identidad` de 008 ya limita la actualización al administrador de la propia empresa; aquí solo
-- se suman las dos columnas a las que el rol de empresa puede escribir.
grant update (color_fondo, fondo_ruta) on empresas to app_empresa;
