// Banknote-style guilloché: bands of phase-shifted wavy circles that cross into a lattice.
// Generated once at build time as SVG path data, so the page ships no drawing code.

export interface Band {
  radius: number;
  amplitude: number;
  waves: number;
  strands: number;
}

function ring(cx: number, cy: number, b: Band, phase: number, steps = 720): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = b.radius + b.amplitude * Math.sin(b.waves * t + phase);
    pts.push(`${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

export function rosette(cx: number, cy: number, bands: Band[]): string {
  return bands
    .flatMap((b) =>
      Array.from({ length: b.strands }, (_, i) => ring(cx, cy, b, (i / b.strands) * ((Math.PI * 2) / b.waves))),
    )
    .join("");
}
