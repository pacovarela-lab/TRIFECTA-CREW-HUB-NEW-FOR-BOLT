/**
 * Prepara un archivo de recibo antes de subirlo:
 *  - Acepta HEIC/HEIF del iPhone y los convierte a JPEG (Safari iOS los decodifica nativo en <img>).
 *  - Reescala imágenes grandes a un lado máximo (default 1800px) y recomprime a JPEG q≈0.82.
 *  - Deja PDFs intactos.
 *
 * Devuelve siempre un `File` listo para subir. Si la conversión falla, regresa el original
 * (no bloquea el flujo del usuario).
 */

const MAX_SIDE = 1800;
const JPEG_QUALITY = 0.82;
const SKIP_RECOMPRESS_BELOW = 600 * 1024; // <600KB: no vale la pena tocar

export const isHeicLike = (file: File): boolean => {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    type === "image/heic-sequence" ||
    type === "image/heif-sequence" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
};

const loadImageFromFile = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });

const canvasToJpegFile = (
  canvas: HTMLCanvasElement,
  baseName: string,
  quality = JPEG_QUALITY,
): Promise<File> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Canvas toBlob falló"));
        const cleanName = baseName.replace(/\.(heic|heif|png|webp|jpeg|jpg)$/i, "") + ".jpg";
        resolve(new File([blob], cleanName, { type: "image/jpeg", lastModified: Date.now() }));
      },
      "image/jpeg",
      quality,
    );
  });

/**
 * Convierte/optimiza un recibo si es imagen. Para PDF retorna el original.
 */
export const prepareReceiptFile = async (file: File): Promise<File> => {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  const isPdf = type === "application/pdf" || name.endsWith(".pdf");
  if (isPdf) return file;

  const looksImage = type.startsWith("image/") || isHeicLike(file) || /\.(jpe?g|png|webp|heic|heif)$/i.test(name);
  if (!looksImage) return file;

  // Si ya es JPEG/PNG pequeño, no recomprimir
  if (!isHeicLike(file) && file.size < SKIP_RECOMPRESS_BELOW) return file;

  try {
    const img = await loadImageFromFile(file);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return file;

    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const targetW = Math.round(w * scale);
    const targetH = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const out = await canvasToJpegFile(canvas, file.name || "receipt.jpg");
    // Si por algún motivo el resultado es más grande, quédate con el original (excepto HEIC, que sí hay que convertir)
    if (!isHeicLike(file) && out.size >= file.size) return file;
    return out;
  } catch (e) {
    console.warn("prepareReceiptFile: no se pudo optimizar, se sube original", e);
    return file;
  }
};
