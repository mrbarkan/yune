/** Reduz a foto para no máx. `max` px no maior lado e devolve JPEG (blob + base64 sem prefixo). */
export async function compressImage(file: File, max = 1280, quality = 0.82) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((ok, fail) =>
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error("Não foi possível ler a imagem."))), "image/jpeg", quality),
  );
  const dataUrl = await new Promise<string>((ok) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as string);
    r.readAsDataURL(blob);
  });
  return { blob, base64: dataUrl.split(",")[1], preview: dataUrl };
}
