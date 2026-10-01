# Conciliación bancaria — importación automática

Sube aquí el CSV del banco (Bank of America). Al guardarlo en `main`, la acción
**Bank CSV Import** lo lee, guarda solo los movimientos nuevos, marca como
**por revisar** los que necesitan atención y te manda un correo con el resumen.

Reglas:

- Solo archivos `.csv` en esta carpeta (los de `processed/` ya se importaron).
- Los movimientos repetidos no se vuelven a guardar.
- Si todos los movimientos ya existían, verás: "Encontré X duplicados y no se subió el archivo".
- Nada se borra ni se modifica: la acción solo agrega.
