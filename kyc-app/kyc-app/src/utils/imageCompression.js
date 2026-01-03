/**
 * Comprimă imaginea la maxim 3 megapixeli și 3MB
 * @param {File} file - Fișierul imagine
 * @returns {Promise<string>} - Base64 string al imaginii comprimate
 */
export async function compressImage(file) {
  const MAX_SIZE = 3 * 1024 * 1024; // 3MB în bytes
  const MAX_MEGAPIXELS = 3 * 1000000; // 3 megapixeli

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = e => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculează megapixeli actuali
        const currentMegapixels = width * height;

        // Resize la max 3 megapixeli păstrând aspect ratio
        if (currentMegapixels > MAX_MEGAPIXELS) {
          const scale = Math.sqrt(MAX_MEGAPIXELS / currentMegapixels);
          width = Math.floor(width * scale);
          height = Math.floor(height * scale);
        }

        // Limitează și dimensiunea maximă (safety check)
        const maxDimension = 2048;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.floor((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.floor((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Încearcă diferite calități până ajunge sub 3MB
        let quality = 0.9;
        let base64 = canvas.toDataURL('image/jpeg', quality);

        while (base64.length > MAX_SIZE * 1.37 && quality > 0.1) {
          // 1.37 = factor conversie base64 (4/3)
          quality -= 0.1;
          base64 = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(base64);
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Convertește base64 la format pentru GPT Vision API
 * @param {string} base64 - Base64 string (cu sau fără prefix)
 * @returns {string} - Base64 curat fără prefix
 */
export function cleanBase64(base64) {
  return base64.replace(/^data:image\/[a-z]+;base64,/, '');
}
