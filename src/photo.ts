export async function prepareAvatarPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Выберите фото в формате JPG, PNG или WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Размер фото должен быть не больше 10 МБ.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('Не удалось прочитать фото. Попробуйте другой файл.'); }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось подготовить фото.');
    const side = Math.min(bitmap.width, bitmap.height);
    context.fillStyle = '#f4f1eb';
    context.fillRect(0, 0, 256, 256);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    return canvas.toDataURL('image/jpeg', .88);
  } finally { bitmap.close(); }
}
