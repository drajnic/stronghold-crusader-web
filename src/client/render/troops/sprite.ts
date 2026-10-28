export class Sprite {
  constructor(
    readonly c: CanvasRenderingContext2D,
    readonly detail: boolean,
  ) {}
  line(ax: number, ay: number, bx: number, by: number, color: string, width = 1): void {
    const c = this.c;
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke();
  }
  oval(x: number, y: number, rx: number, ry: number, fill: string, stroke?: string): void {
    const c = this.c;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 0.9;
      c.stroke();
    }
  }
  shape(
    points: readonly (readonly [number, number])[],
    fill: string,
    stroke = '#302b28',
    width = 0.9,
  ): void {
    const c = this.c;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.lineJoin = 'round';
      c.stroke();
    }
  }
  limb(
    ax: number,
    ay: number,
    kx: number,
    ky: number,
    bx: number,
    by: number,
    color: string,
    width: number,
  ): void {
    this.line(ax, ay, kx, ky, '#302c29', width + 1.4);
    this.line(kx, ky, bx, by, '#302c29', width + 1.4);
    this.line(ax, ay, kx, ky, color, width);
    this.line(kx, ky, bx, by, color, width);
  }
}
