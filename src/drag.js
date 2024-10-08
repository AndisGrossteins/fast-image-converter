import isSvg from 'is-svg';

const SUPPORTED_MIME_TYPES = new Set([
  'image/svg+xml',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'application/pdf',
  'image/heif',
  'image/heic',
  'image/heif-sequence',
  'image/heic-sequence',
  'application/xml',
  'text/xml',
]);

const supportsFileSystemAccessAPI =
  "getAsFileSystemHandle" in DataTransferItem.prototype;
const supportsWebkitGetAsEntry =
  "webkitGetAsEntry" in DataTransferItem.prototype;

function createSvgFile(svg) {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  return new File([blob], "image.svg", {
    type: "image/svg+xml",
    lastModified: new Date().getTime()
  });
}

/**
 * Creates a file drop handler for a given element. The handler supports
 * pasting images from the clipboard and dragging/dropping files.
 *
 * When a file is dropped/pasted, the `onDrop(files)` callback is called with
 * an array of File objects.
 *
 * The handler adds the following classes to the document body:
 * - `drag-over` when a file is dragged over the element
 *
 * @param {Element} el - the element to add the file drop handler to
 * @param {function} onDrop - the callback to call when a file is dropped/pasted
 */
export function createFileDropHandler(el, onDrop) {

  const handleDataTransfer = async (dataTransfer) => {
    const files = [];

    for (const type of dataTransfer.types) {
      if (type !== 'text/plain') continue;
      const text = dataTransfer.getData(type);
      if (!isSvg(text)) continue;
      const file = createSvgFile(text);
      files.push(file);
    }

    if (dataTransfer.items) {
      const promises = [...dataTransfer.items].filter(item => item.kind === 'file')
        .map(item => supportsFileSystemAccessAPI ?
          item.getAsFileSystemHandle() :
          supportsWebkitGetAsEntry ? item.webkitGetAsEntry() :
            item.getAsFile())

      const traverse = async (handle) => {

        if (!handle) {
          console.warn('invalid clipboardData')
          return
        }

        if (handle.kind === 'directory' || handle.isDirectory) {
          for await (const entry of handle.values()) {
            await traverse(entry);
          }
        } else {
          // heic/heif is an exception
          if ('getFile' in handle) {
            const file = await handle.getFile();
            if (SUPPORTED_MIME_TYPES.has(file.type) || /\.(heif|heic)$/i.test(file.name)) {
              files.push(file);
            }
          }
        }
      };

      for await (const handle of promises) {
        await traverse(handle);
      }
    }

    for (const file of [...dataTransfer.files]) {
      if (SUPPORTED_MIME_TYPES.has(file.type) || /\.(heif|heic)$/i.test(file.name)) {
        files.push(file);
      }
    }

    onDrop(files);
  }

  document.onpaste = async e => {
    e.preventDefault();
    const dataTransfer = (e.clipboardData || window.clipboardData);
    await handleDataTransfer(dataTransfer);
  }

  el.ondrag = e => {
    e.preventDefault();
    e.stopPropagation();
  };

  el.ondrop = async ev => {
    ev.preventDefault();
    ev.stopPropagation();
    document.body.classList.remove('drag-over');
    await handleDataTransfer(ev.dataTransfer);
  }

  el.ondragstart = e => {
    e.preventDefault();
    e.stopPropagation();
  };

  el.ondragend = e => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove('drag-over');
  };


  el.ondragover = e => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add('drag-over');
  }

  el.ondragenter = e => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add('drag-over');
  }

  el.dragleave = e => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove('drag-over');
  }
}
