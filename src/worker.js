import './hack.js'
import { encode as encode_png, decode as decode_png } from '@jsquash/png';
import { encode as encode_jpeg, decode as decode_jpeg } from '@jsquash/jpeg';
import { decode as decode_webp } from '@jsquash/webp';
import { defaultOptions as webp_defaultOptions } from '@jsquash/webp/meta.js'
import { defaultOptions as avif_defaultOptions } from '@jsquash/avif/meta.js'

import avif_dec from '@jsquash/avif/codec/dec/avif_dec.js';
import avif_enc from '@jsquash/avif/codec/enc/avif_enc.js';
import webp_enc from '@jsquash/webp/codec/enc/webp_enc.js';

import wasm_heif from "@saschazar/wasm-heif";
import wasm_heif_url from "@saschazar/wasm-heif/wasm_heif.wasm?url";

import { initEmscriptenModule } from '@jsquash/avif/utils.js'
import { fileToArrayBuffer } from './buffer.js'
import resvgWasmUrl from '@resvg/resvg-wasm/index_bg.wasm?url';
import { initWasm as initResvg, Resvg } from '@resvg/resvg-wasm';
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs'
import PDFWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker'
import { nanoid } from 'nanoid';
import { transform } from 'vector-drawable-svg';

let pdfReady = false;
let isResvgReady = false;
let emscriptenModuleAVIF;
let emscriptenModuleAVIF_ENC;
let emscriptenModuleWEBP;

  /**
   * Decodes a HEIF/HEIC image.
   *
   * @param {ArrayBuffer} buffer The image data to be decoded.
   * @returns {Promise<ImageData>} A promise resolving to the decoded image data.
   *
   * This function uses the wasm-heif library to decode the image. The
   * library is loaded asynchronously, and once it is loaded, the image is
   * decoded and the resulting ImageData is returned.
   */
async function decode_heif(buffer) {
  // Initialize the wasm-heif library
  const heif_decoder = await (new Promise(r => {
    wasm_heif({
      // The URL of the wasm file
      locateFile: () => wasm_heif_url,
      // Don't run the wasm module immediately
      noInitialRun: true,
      // Once the module is initialized, call this callback
      onRuntimeInitialized() {
        r(this)
      },
    })
  }))

  // Decode the image
  const arrayBuffer = new Uint8Array(buffer);
  const pixels = heif_decoder.decode(arrayBuffer, arrayBuffer.length, false);

  // Get the dimensions of the image
  const { width, height } = heif_decoder.dimensions();

  // Create a new ImageData with the same dimensions
  const imageData = new ImageData(width, height);

  // Copy the decoded pixels to the ImageData
  const data = imageData.data;
  let t = 0;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = pixels[t];
    data[i + 1] = pixels[t + 1];
    data[i + 2] = pixels[t + 2];
    data[i + 3] = 255;
    t += 3;
  }

  // Clean up the wasm module
  heif_decoder.free();

  // Return the decoded image
  return imageData;
}


async function encode_avif(image) {

  if (!emscriptenModuleAVIF_ENC) {
    emscriptenModuleAVIF_ENC = initEmscriptenModule(avif_enc);
  }

  const module = await emscriptenModuleAVIF_ENC;
  const result = module.encode(image.data, image.width, image.height, avif_defaultOptions);

  if (!result)
    throw new Error('Decoding error');

  return result;
}


async function encode_webp(image) {

  if (!emscriptenModuleWEBP) {
    emscriptenModuleWEBP = initEmscriptenModule(webp_enc);
  }

  const module = await emscriptenModuleWEBP;
  const result = module.encode(image.data, image.width, image.height, webp_defaultOptions);

  if (!result)
    throw new Error('Decoding error');

  return result;
}

async function decode_avif(buffer) {

  if (!emscriptenModuleAVIF) {
    emscriptenModuleAVIF = initEmscriptenModule(avif_dec);
  }

  const module = await emscriptenModuleAVIF;
  const result = module.decode(buffer);

  if (!result) {
    throw new Error('Decoding error');
  }

  return result;
}

async function decode_svg(data, { target }) {
  const isJpeg = target === 'jpeg';

  if (!isResvgReady) {
    await initResvg(fetch(resvgWasmUrl))
    isResvgReady = true;
  }
  const opts = {};

  if (isJpeg) {
    opts['background'] = 'white';
  }

  const resvg = new Resvg((data instanceof Uint8Array) ? data : new Uint8Array(data), opts);
  const { pixels, width, height } = resvg.render();
  const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
  return imageData;
}

  /**
   * Decodes an XML image.
   *
   * @param {ArrayBuffer} data The image data to be decoded.
   * @param {Object} opts The options to be passed to {@link decode_svg}.
   * @returns {Promise<ImageData>} A promise resolving to the decoded image data.
   */
async function decode_xml(data, opts) {
  const textDecoder = new TextDecoder();
  const textEncoder = new TextEncoder();
  const xmlString = textDecoder.decode(data);
  const svgString = transform(xmlString);
  const svgArrayBuffer = textEncoder.encode(svgString);
  return decode_svg(svgArrayBuffer, opts);
}

async function decode_pdf(data) {

  if (!pdfReady) {
    const worker = new PDFWorker();
    pdfjs.GlobalWorkerOptions.workerPort = worker;
    pdfReady = true;
  }

  const document = {
    fonts: self.fonts,
    createElement: (name) => {
      if (name == 'canvas') {
        return new OffscreenCanvas(1, 1);
      }
      return null;
    },
  };

  const doc = await pdfjs.getDocument({
    data, ownerDocument: document
  }).promise;

  const imageDataCollection = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const pageViewport = page.getViewport({ scale: 2 });
    const canvas = new OffscreenCanvas(pageViewport.width, pageViewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({
      canvasContext: ctx,
      viewport: pageViewport,
    }).promise

    imageDataCollection.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }
  return imageDataCollection;
}

addEventListener("message", async ({ data }) => {

  const encoders = {
    png: encode_png,
    webp: encode_webp,
    jpeg: encode_jpeg,
    avif: encode_avif,
  }

  const decoders = {
    png: decode_png,
    webp: decode_webp,
    jpeg: decode_jpeg,
    jpg: decode_jpeg,
    avif: decode_avif,
    heif: decode_heif,
    heic: decode_heif,
    'svg+xml': decode_svg,
    'xml': decode_xml,
    pdf: decode_pdf,
  }

  const extensions = {
    jpeg: ".jpg",
    png: ".png",
    webp: ".webp",
    avif: ".avif",
    heif: ".heif",
    heic: ".heic",
    pdf: ".pdf",
  }

  const emit = async ({
    id,
    enc, rawBuffer, filename, target
  }) => {
    const imageData = await enc(rawBuffer);
    const arr = new Uint8Array(imageData);
    const blob = new Blob([arr], { type: "image/" + target });

    postMessage({
      id,
      blob,
      filename,
    });
  }

  for (const _file of data) {
    const { id, file, format } = _file;
    const target = format.toLowerCase();

    let src = file.type.split('/')[1];

    if (!src) {
      src = file.name.split('.').pop();
      if (typeof src === 'string') {
        src = src.toLowerCase();
      }
    }

    const enc = encoders[target];
    const dec = decoders[src];

    if (!enc || !dec) {
      // failed
      continue;
    }

    const arrayBuffer = await fileToArrayBuffer(file);
    const rawBuffer = await dec(arrayBuffer, { target });

    if (Array.isArray(rawBuffer)) {
      const items = rawBuffer.map((raw, i) => {
        return {
          ..._file,
          id: nanoid(11),
          bufferedIndex: i,
        }
      })

      postMessage({
        id,
        items,
        emitMultiple: true,
        length: rawBuffer.length,
      })

      for (const item of items) {
        const rf = rawBuffer[item.bufferedIndex];
        const ext = extensions[target];
        let filename = file.name.replace(/\.(xml|jpe?g|pdf|png|webp|heic|heif|svg)$/i, '');
        filename += `-${item.bufferedIndex + 1}` + ext;
        await emit({ id: item.id, enc, rawBuffer: rf, filename, target });
      }

      continue;
    }

    const ext = extensions[target];
    let filename = file.name.replace(/\.(xml|jpe?g|pdf|png|webp|heic|heif|svg)$/i, '');
    filename += ext;

    await emit({
      id,
      enc,
      rawBuffer,
      file,
      target,
      filename,
    })

    // const imageData = await enc(rawBuffer);
    // const arr = new Uint8Array(imageData);
    // const blob = new Blob([arr], { type: "image/" + target });


    // postMessage({
    //   id,
    //   blob,
    //   filename,
    // })
  }
})

