export function installImageTestPolyfill(): void {
  if (typeof Image === 'undefined') {
    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      value: class {
        src = '';
        width = 1;
        height = 1;
      },
    });
  }
  if (typeof document === 'undefined') {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement(tag: string) {
          if (tag !== 'canvas') {
            throw new Error(`Unsupported test element: ${tag}`);
          }
          return {
            width: 1,
            height: 1,
            getContext() {
              return {
                createImageData(width: number, height: number) {
                  return { data: new Uint8ClampedArray(width * height * 4) };
                },
                putImageData() {},
                drawImage() {},
                getImageData(_sx = 0, _sy = 0, width = 1, height = 1) {
                  return { data: new Uint8ClampedArray(width * height * 4) };
                },
                scale() {},
                fillRect() {},
                fillText(_text: string) {},
                fillStyle: '',
                font: '',
                textAlign: '',
                textBaseline: '',
              };
            },
            toDataURL() {
              return 'data:image/png;base64,';
            },
          };
        },
      },
    });
  }
}
