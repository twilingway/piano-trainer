export const NOTE_FACE_WIDTH = 64;
export const NOTE_FACE_HEIGHT = 84;
export const NOTE_BLOOM_MARGIN = 48;

type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

/** Neutral masks: colour, emitted light, exterior bloom and the glass's white bevel. */
export function bakeNoteMaterial(createCanvas: CanvasFactory) {
  const face = createCanvas(NOTE_FACE_WIDTH, NOTE_FACE_HEIGHT);
  const emission = createCanvas(NOTE_FACE_WIDTH, NOTE_FACE_HEIGHT);
  const bevel = createCanvas(NOTE_FACE_WIDTH, NOTE_FACE_HEIGHT);
  const bloom = createCanvas(
    NOTE_FACE_WIDTH + NOTE_BLOOM_MARGIN * 2,
    NOTE_FACE_HEIGHT + NOTE_BLOOM_MARGIN * 2
  );
  const faceContext = face.getContext("2d");
  if (faceContext) {
    const gradient = faceContext.createLinearGradient(2, 0, 62, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0.42)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.38)");
    gradient.addColorStop(1, "rgba(255,255,255,0.46)");
    faceContext.fillStyle = gradient;
    faceContext.beginPath();
    faceContext.roundRect(2, 2, 60, 80, 8);
    faceContext.fill();
  }
  const emissionContext = emission.getContext("2d");
  if (emissionContext) {
    // Light comes from a broad coloured core, rather than just its outline.
    const gradient = emissionContext.createLinearGradient(2, 0, 62, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0.65)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.78)");
    gradient.addColorStop(1, "rgba(255,255,255,0.68)");
    emissionContext.fillStyle = gradient;
    emissionContext.beginPath();
    emissionContext.roundRect(3, 3, 58, 78, 7);
    emissionContext.fill();
  }
  const bevelContext = bevel.getContext("2d");
  if (bevelContext) {
    bevelContext.beginPath();
    bevelContext.roundRect(2, 2, 60, 80, 8);
    bevelContext.save();
    bevelContext.clip();
    const hotFoot = bevelContext.createLinearGradient(0, 58, 0, 82);
    hotFoot.addColorStop(0, "rgba(255,255,255,0)");
    hotFoot.addColorStop(0.6, "rgba(255,255,255,0.16)");
    hotFoot.addColorStop(1, "rgba(255,255,255,0.85)");
    bevelContext.fillStyle = hotFoot;
    bevelContext.fillRect(2, 58, 60, 24);
    // A broad reflection avoids narrow internal seams that read as dirty stripes.
    const reflection = bevelContext.createLinearGradient(2, 0, 62, 0);
    reflection.addColorStop(0, "rgba(255,255,255,0)");
    reflection.addColorStop(0.35, "rgba(255,255,255,0.025)");
    reflection.addColorStop(1, "rgba(255,255,255,0)");
    bevelContext.fillStyle = reflection;
    bevelContext.fillRect(2, 2, 60, 80);
    bevelContext.restore();
    bevelContext.strokeStyle = "rgba(255,255,255,0.9)";
    bevelContext.lineWidth = 1.8;
    bevelContext.beginPath();
    bevelContext.roundRect(2, 2, 60, 80, 8);
    bevelContext.stroke();
  }
  const bloomContext = bloom.getContext("2d");
  if (bloomContext) {
    // Bake a broad Gaussian falloff explicitly: canvas shadowBlur varies by renderer.
    const pixels = bloomContext.createImageData(bloom.width, bloom.height);
    for (let y = 0; y < bloom.height; y++) {
      for (let x = 0; x < bloom.width; x++) {
        const dx = Math.abs(x + 0.5 - bloom.width / 2) - 22;
        const dy = Math.abs(y + 0.5 - bloom.height / 2) - 32;
        const distance =
          Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - 8;
        const outside = Math.max(distance, 0);
        const inwardFade = distance < 0 ? Math.exp(-(distance * distance) / 18) : 1;
        const light =
          inwardFade *
          (0.38 * Math.exp(-(outside * outside) / (2 * 18 * 18)) +
            0.55 * Math.exp(-(outside * outside) / (2 * 5 * 5)));
        const index = (y * bloom.width + x) * 4;
        pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = 255;
        pixels.data[index + 3] = Math.round(Math.min(1, light) * 255);
      }
    }
    bloomContext.putImageData(pixels, 0, 0);
  }
  return { face, emission, bloom, bevel };
}
