// Only loaded when the browser cannot export the cropped canvas as WebP.
import createEncoder from './vendor/crew-webp/webp_enc.js';
import {defaultOptions} from './vendor/crew-webp/meta.js';

let encoder;
export async function encodeCrewWebp(image,{quality=90}={}) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image.source || image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = canvas.height = 1;
  encoder ??= createEncoder({noInitialRun: true}).catch(error => {
    encoder = undefined;
    throw error;
  });
  const codec = await encoder;
  const bytes = codec.encode(pixels.data, pixels.width, pixels.height, {...defaultOptions, quality});
  if (!bytes?.length) throw new Error('WebP encoding failed');
  return new File([bytes], 'photo.webp', {type: 'image/webp'});
}
