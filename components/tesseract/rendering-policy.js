const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|swrast|software\s+(?:rasterizer|renderer)|microsoft basic render driver/i;

export function createHardwareContext(canvas, options = {}) {
  try {
    const attributes = { ...options, failIfMajorPerformanceCaveat: true };
    const gl = canvas.getContext("webgl", attributes) ||
      canvas.getContext("experimental-webgl", attributes);
    if (!gl) return null;

    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "";
    if (SOFTWARE_RENDERER.test(name)) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return null;
    }
    return gl;
  } catch {
    return null;
  }
}

export function createPerformanceMonitor() {
  let previous = null;
  let warmup = 0;
  let duration = 0;
  let frames = 0;
  let slowWindows = 0;

  return {
    reset() {
      previous = null;
      warmup = duration = frames = slowWindows = 0;
    },
    sample(now) {
      const delta = previous === null ? 0 : Math.max(0, now - previous);
      previous = now;
      warmup += delta;
      if (warmup < 1000 || delta === 0) return false;
      duration += delta;
      frames++;
      if (duration < 2000) return false;
      slowWindows = frames * 1000 / duration < 20 ? slowWindows + 1 : 0;
      duration = frames = 0;
      return slowWindows >= 2;
    },
  };
}
