// TASKS.csv #1279 — a canvas as a PNG data URL without freezing the window: toBlob takes its copy when called, while the frame is in the buffer, and
// encodes off the main thread. toDataURL held the window about 0.8 s on a 3000 px Layout capture.
export const canvasPngDataUrl = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) { reject(new Error("The view could not be encoded.")); return; }
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  }, "image/png");
});
