declare module "zdog" {
  export interface Vec3 {
    x: number;
    y: number;
    z: number;
  }
  export class Anchor {
    constructor(opts?: Record<string, unknown>);
    rotate: Vec3;
    translate: Vec3;
    addTo(parent: Anchor): void;
    updateRenderGraph(): void;
    updateGraph(): void;
    renderGraphCanvas(ctx: CanvasRenderingContext2D): void;
  }
  export class Illustration extends Anchor {}
  export class Shape extends Anchor {}
  export class Box extends Anchor {}
  export class Rect extends Anchor {}
  export class RoundedRect extends Anchor {}
  export class Ellipse extends Anchor {}
  export class Polygon extends Anchor {}
  export class Cylinder extends Anchor {}
  export class Cone extends Anchor {}
  export class Hemisphere extends Anchor {}
  export class Group extends Anchor {}
  const Zdog: {
    Anchor: typeof Anchor;
    Illustration: typeof Illustration;
    Shape: typeof Shape;
    Box: typeof Box;
    Rect: typeof Rect;
    RoundedRect: typeof RoundedRect;
    Ellipse: typeof Ellipse;
    Polygon: typeof Polygon;
    Cylinder: typeof Cylinder;
    Cone: typeof Cone;
    Hemisphere: typeof Hemisphere;
    Group: typeof Group;
    TAU: number;
  };
  export default Zdog;
}
