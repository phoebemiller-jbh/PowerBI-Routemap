// azureMapController.ts
// Migration of your Bing Maps-based controller to Azure Maps Web SDK (V3)

// ──────────────────────────────────────────────────────────────────────────────
// External dependencies from your project (unchanged)
import { ILocation, IBound } from './converter';
import { anchorPixel, bound, anchor, fitOptions, area } from './converter';
import { keys, IPoint, partial } from '../type';
import { ISelex, selex } from '../d3';

// ──────────────────────────────────────────────────────────────────────────────
// Azure Maps SDK
import * as atlas from 'azure-maps-control';

// Keep your alias
type Map = atlas.Map;
type Action<T> = (a: T) => void;

// Optional: global callback retained for compatibility with your earlier pattern.
// Not used for script loading anymore (we bundle the SDK).
declare var __lavaBuildMap: () => void;

// ──────────────────────────────────────────────────────────────────────────────
// Public formatting interfaces (unchanged surface)
export interface IMapElement {
  forest: boolean,
  label: boolean,
  road: "color" | "gray" | 'gray_label' | "hidden",
  icon: boolean,
  area: boolean,
  building: boolean,
  city: boolean,
  scale: boolean
}

export interface IMapControl {
  type: 'hidden' | 'aerial' | 'road' | 'grayscale' | 'canvasDark' | 'canvasLight',
  lang: string,
  pan: boolean,
  zoom: boolean
}

export interface IMapFormat extends IMapControl, IMapElement { }

// ──────────────────────────────────────────────────────────────────────────────
// Utilities adapted for Azure Maps

// Azure Maps vector tiles are 512px; control supports zooms up to 24.
// This mirrors your original logic but with 512 instead of 256 and clamps to 24.
export function defaultZoom(width: number, height: number): number {
  const min = Math.min(width, height);
  for (let level = 1; level <= 24; level++) {
    if (512 * Math.pow(2, level) > min) {
      return level;
    }
  }
  return 24;
}

// Convert ILocation <-> atlas Position helpers
const toPos = (loc: ILocation): atlas.data.Position => [loc.longitude, loc.latitude];
const toLoc = (pos: atlas.data.Position): ILocation => ({ longitude: pos[0], latitude: pos[1] });

// Pixel conversion equivalents for Azure Maps
export function pixel(map: atlas.Map, loc: ILocation): IPoint {
  const px = map.positionsToPixels([toPos(loc)])[0];
  return { x: px[0], y: px[1] } as IPoint;
}

export function coordinate(map: atlas.Map, p: IPoint): ILocation {
  const pos = map.pixelsToPositions([new atlas.Pixel(p.x, p.y)])[0];
  return toLoc(pos);
}

// ──────────────────────────────────────────────────────────────────────────────
// Styling translation: your fmt → Azure Maps style & overrides

function azureStyle(v: IMapFormat): atlas.SupportedStyle {
  switch (v.type) {
    case 'aerial':      return 'satellite_road_labels'; // closest to Bing aerial with labels
    case 'road':        return 'road';
    case 'grayscale':   return 'grayscale_light';
    case 'canvasDark':  return 'grayscale_dark';        // or 'night'
    case 'canvasLight': return 'grayscale_light';
    case 'hidden':      return 'blank';
    default:            return 'road';
  }
}

function makeStyleOverrides(v: IMapFormat): atlas.StyleOverrides {
  // Azure Maps exposes curated overrides; this approximates your Bing customMapStyle.
  const o: atlas.StyleOverrides = {
    showLabels: v.road === 'gray' ? false : v.label,     // gray w/o labels → false
    showRoadDetails: v.road !== 'hidden',
    showBuildingFootprints: v.building
    // Additional overrides available: country/admin borders, etc.
  };

  if (v.type === 'hidden') {
    o.showLabels = false;
    o.showRoadDetails = false;
    o.showBuildingFootprints = false;
  }
  return o;
}

// ──────────────────────────────────────────────────────────────────────────────
// Your MapFormat class (unchanged API)

export class MapFormat implements IMapFormat {
  type = 'road' as 'aerial' | 'road' | 'grayscale' | 'canvasDark' | 'canvasLight';
  lang = 'default';
  pan = true;
  zoom = true;
  city = false;
  road = "color" as "color" | "gray" | 'gray_label' | "hidden";
  label = true;
  forest = true;
  icon = false;
  building = false;
  area = false;
  scale = false;

  public static build(...fmts: any[]): MapFormat {
    const ret = new MapFormat();
    for (const f of fmts.filter(v => v)) {
      for (const key in ret) {
        if (key in f) {
          (ret as any)[key] = f[key];
        }
      }
    }
    return ret;
  }

  public static control<T>(fmt: MapFormat, extra: T): IMapControl & T {
    const result = partial(fmt, ['type', 'lang', 'pan', 'zoom']) as any;
    for (const key in extra) result[key] = (extra as any)[key];
    return result;
  }

  public static element<T>(fmt: MapFormat, extra: T): IMapElement & T {
    const result = partial(fmt, ['road', 'forest', 'label', 'city', 'icon', 'building', 'area', 'scale']) as any;
    for (const key in extra) result[key] = (extra as any)[key];
    return result;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Your "capability" metadata object (unchanged keys/labels)

const capability = {
  "mapControl": {
    "displayName": "Map control",
    "properties": {
      "type": {
        "displayName": "Type", "type": {
          "enumeration": [
            { "displayName": "Aerial", "value": "aerial" },
            { "displayName": "Color", "value": "road" },
            { "displayName": "Gray", "value": "grayscale" },
            { "displayName": "Dark", "value": "canvasDark" },
            { "displayName": "Light", "value": "canvasLight" },
            { "displayName": "Hidden", "value": "hidden" }
          ]
        }
      },
      "lang": {
        "displayName": "Language",
        "description": "The language used in the map",
        "type": {
          "enumeration": [
            { "displayName": "Default", "value": "default" },
            { "displayName": "Chinese", "value": "zh-HK" },
            { "displayName": "Czech", "value": "cs-CZ" },
            { "displayName": "Danish", "value": "da-DK" },
            { "displayName": "Dutch", "value": "nl-NL" },
            { "displayName": "English", "value": "en-US" },
            { "displayName": "Finnish", "value": "fi-FI" },
            { "displayName": "French", "value": "fr-FR" },
            { "displayName": "German", "value": "de-DE" },
            { "displayName": "Italian", "value": "it-IT" },
            { "displayName": "Japanese", "value": "ja-JP" },
            { "displayName": "Korean", "value": "Ko-KR" },
            { "displayName": "Norwegian(Bokmal)", "value": "nb-NO" },
            { "displayName": "Polish", "value": "pl-PL" },
            { "displayName": "Portuguese", "value": "pt-BR" },
            { "displayName": "Russian", "value": "ru-RU" },
            { "displayName": "Spanish", "value": "es-ES" },
            { "displayName": "Swedish", "value": "sv-SE" }
          ]
        }
      },
      "pan": { "displayName": "Pan", "type": { "bool": true } },
      "zoom": { "displayName": "Zoom", "type": { "bool": true } },
      "autofit": {
        "displayName": "Auto fit",
        "description": "Fit all data in the view when data changed",
        "type": { "bool": true }
      }
    }
  },
  "mapElement": {
    "displayName": "Map element",
    "properties": {
      "forest": { "displayName": "Forest", "type": { "bool": true } },
      "road": {
        "displayName": "Road", "type": {
          "enumeration": [
            { "displayName": "Default", "value": "color" },
            { "displayName": "Gray w/ label", "value": "gray_label" },
            { "displayName": "Gray w/o label", "value": "gray" },
            { "displayName": "Hidden", "value": "hidden" }
          ]
        }
      },
      "label": { "displayName": "Label", "type": { "bool": true } },
      "city": { "displayName": "City", "type": { "bool": true } },
      "icon": { "displayName": "Icon", "type": { "bool": true } },
      "building": { "displayName": "Building", "type": { "bool": true } },
      "area": { "displayName": "Area", "type": { "bool": true } },
      "scale": { "displayName": "Scale bar", "type": { "bool": true } }
    }
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// Map init options builder for Azure Maps

type MapInitOptions =
  atlas.ServiceOptions &
  atlas.StyleOptions &
  atlas.UserInteractionOptions &
  (atlas.CameraOptions | atlas.CameraBoundsOptions);

function parameter(map: Map | null, fmt: IMapFormat, div: HTMLDivElement): MapInitOptions {
  const style = azureStyle(fmt);

  const styleOptions: atlas.StyleOptions = {
    style,
    language: fmt.lang === 'default' ? undefined : fmt.lang,
    showLogo: true,             // Azure Maps requires attribution/logo
    showFeedbackLink: false,
    styleOverrides: makeStyleOverrides(fmt)
  };

  const ui: atlas.UserInteractionOptions = {
    interactive: !!(fmt.pan || fmt.zoom),
    dragPanInteraction: !!fmt.pan,
    scrollZoomInteraction: !!fmt.zoom,
    dblClickZoomInteraction: !!fmt.zoom
  };

  const camera: atlas.CameraOptions = {};
  if (map) {
    const cam = map.getCamera();
    camera.center = cam.center;
    camera.zoom = cam.zoom;
    camera.bearing = cam.bearing;
    camera.pitch = cam.pitch;
  }

  // IMPORTANT: Add your authentication here (subscription key or AAD).
  const auth: atlas.ServiceOptions = {
    authOptions: {
      authType: 'subscriptionKey',
      subscriptionKey: 'YOUR_AZURE_MAPS_KEY'
      // Or:
      // authType: 'anonymous',
      // clientId: 'YOUR_CLIENT_ID',
      // getToken: (resolve, reject) => fetch('/token').then(r => r.text()).then(resolve, reject)
    }
  };

  return { ...auth, ...styleOptions, ...ui, ...camera };
}

// ──────────────────────────────────────────────────────────────────────────────
// Listener interface unchanged

export interface IListener {
  transform?(ctl: Controller, pzoom: number, end?: boolean): void;
  resize?(ctl: Controller): void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Controller migrated to Azure Maps

export class Controller {
  private _div: HTMLDivElement;
  private _map!: Map;
  private _fmt: IMapFormat;
  private _svg: ISelex;
  private _svgroot: ISelex;

  public get map() { return this._map; }
  public get format() { return this._fmt; }
  public get svg() { return this._svgroot; }

  private _canvas: ISelex;
  public get canvas() { return this._canvas; }

  public location(p: IPoint): ILocation {
    const pos = this._map.pixelsToPositions([new atlas.Pixel(p.x, p.y)])[0];
    return toLoc(pos);
  }

  public setCenterZoom(center: atlas.data.Position, zoom: number) {
    if (this._map) {
      const z = Math.max(1, Math.min(24, zoom));
      this._map.setCamera({ center, zoom: z });
    }
  }

  public pixel(loc: ILocation | IBound): IPoint {
    if ((loc as IBound).anchor) {
      // If your anchorPixel helper supports Azure Maps, use it.
      // Else, approximate by converting the bound's anchor location.
      return anchorPixel(this._map as any, loc as any) as IPoint;
    } else {
      return pixel(this._map, loc as ILocation);
    }
  }

  public anchor(locs: ILocation[]) { return anchor(locs); }
  public area(locs: ILocation[], level = 20) { return area(locs, level); }
  public bound(locs: ILocation[]): IBound { return bound(locs); }

  private _listener: IListener[] = [];
  public add(v: IListener) { this._listener.push(v); return this; }

  public fitView(areas: IBound[], backupCenter?: ILocation) {
    if (!this._map) return;
    const width = this._containerWidth(), height = this._containerHeight();
    const config = fitOptions(areas, { width, height }); // uses your helper

    // If your helper provides center/zoom, use them; otherwise compute bounds.
    if ((config as any).bounds) {
      this._map.setCamera({ ...(config as any) });
    } else if ((config as any).center && (config as any).zoom !== undefined) {
      const { center, zoom } = config as any;
      this._map.setCamera({ center: toPos(center), zoom });
    } else if (backupCenter) {
      this._map.setCamera({ center: toPos(backupCenter) });
    }
    this._viewChange(false);
  }

  constructor(id: string) {
    const div = selex(id).node<HTMLDivElement>();
    this._fmt = {} as IMapFormat;
    this._div = div;

    // Build overlay surfaces (unchanged)
    const config = (root: ISelex) => {
      root.att.tabIndex(-1)
        .sty.pointer_events('none')
        .sty.position('absolute')
        .sty.visibility('inherit')
        .sty.user_select('none');
      return root;
    };
    this._canvas = config(selex(div).append('canvas'));
    this._svg = config(selex(div).append('svg'));
    this._svgroot = this._svg.append('g').att.id('root');

    // Keep compatibility with your callback if needed.
    __lavaBuildMap = () => {
      this._remap();
      this._then && this._then(this._map);
      this._then = null as any;
    };
  }

  // Build or rebuild the Azure map
  private _remap(): Map {
    const opts = parameter(this._map ?? null, this._fmt, this._div);

    // Recreate map (simplifies style/userInteraction changes that require full re-init)
    if (this._map) {
      // Clean event handlers
      this._handler1 && this._map.events.remove(this._handler1);
      this._handler2 && this._map.events.remove(this._handler2);
      this._handler3 && this._map.events.remove(this._handler3);
      // Dispose old map
      this._map.dispose();
    }

    const map = new atlas.Map(this._div, opts);

    // Attach your overlay nodes into the map container
    const container = map.getMapContainer();
    this._canvas && container.appendChild(this._canvas.node());
    this._svg && container.appendChild(this._svg.node());

    // Event wiring
    this._handler1 = map.events.add('move', () => this._viewChange(false));
    this._handler2 = map.events.add('moveend', () => this._viewChange(true));
    this._handler3 = map.events.add('resize', () => this._resize());

    this._map = map;
    this._resize(); // initial sizing
    return map;
  }

  private _handler1!: atlas.IEventRef;
  private _handler2!: atlas.IEventRef;
  private _handler3!: atlas.IEventRef;

  private _viewChange(end = false) {
    const cam = this._map.getCamera();
    const zoomNow = cam.zoom;
    for (const l of this._listener) {
      l.transform && l.transform(this, this._zoom, end);
    }
    this._zoom = zoomNow;
  }

  private _zoom: number = 1;

  private _resize(): void {
    if (!this._map) return;
    const w = this._containerWidth(), h = this._containerHeight();
    this._svg.att.width('100%').att.height('100%');
    this._canvas && this._canvas.att.size(w, h);
    this._svgroot.att.translate(w / 2, h / 2);

    for (const l of this._listener) {
      l.resize && l.resize(this);
    }
  }

  private _containerWidth() { return this._div.clientWidth || this._map.getMapContainer().clientWidth; }
  private _containerHeight() { return this._div.clientHeight || this._map.getMapContainer().clientHeight; }

  private _then!: Action<Map>;
  restyle(fmt: Partial<IMapFormat>, then?: Action<Map>): Controller {
    then = then || (() => { });

    const dirty = {} as Partial<IMapFormat>;
    for (const k in fmt) {
      if ((fmt as any)[k] !== (this._fmt as any)[k]) {
        (dirty as any)[k] = (this._fmt as any)[k] = (fmt as any)[k];
      }
    }
    if (keys(dirty).length === 0 && this._map) return this;

    // If map not created yet: create
    if (!this._map) {
      this._then = then;
      this._remap();
      return this;
    }

    // Changes that impact base style/overrides → setStyle (no full remap needed)
    const styleAffecting: Record<string, 1> = {
      type: 1, label: 1, forest: 1, road: 1, city: 1, icon: 1, area: 1, building: 1
    };
    for (const k in dirty) {
      if (styleAffecting[k]) {
        const newStyle = azureStyle(this._fmt);
        const newOverrides = makeStyleOverrides(this._fmt);
        // Update style + language in one call
        this._map.setStyle({
          style: newStyle,
          language: this._fmt.lang === 'default' ? undefined : this._fmt.lang,
          styleOverrides: newOverrides
        });
        then(this._map);
        return this;
      }
    }

    // Language change alone
    if ('lang' in dirty) {
      this._map.setStyle({
        language: this._fmt.lang === 'default' ? undefined : this._fmt.lang
      });
    }

    // Pan/zoom interaction changes
    const ui: Partial<atlas.UserInteractionOptions> = {};
    let uiDirty = false;
    if ('pan' in dirty) {
      ui.interactive = !!(this._fmt.pan || this._fmt.zoom);
      (ui as any).dragPanInteraction = !!this._fmt.pan;
      uiDirty = true;
    }
    if ('zoom' in dirty) {
      ui.interactive = !!(this._fmt.pan || this._fmt.zoom);
      (ui as any).scrollZoomInteraction = !!this._fmt.zoom;
      (ui as any).dblClickZoomInteraction = !!this._fmt.zoom;
      uiDirty = true;
    }
    if (uiDirty) {
      this._map.setUserInteraction(ui as atlas.UserInteractionOptions);
    }

    then(this._map);
    return this;
  }
}

// NOTE: Removed Bing-specific copyright hiding.
// Azure Maps requires attribution/logo. Use `showLogo: true` (default) as configured in parameter().

// ──────────────────────────────────────────────────────────────────────────────
// End of file
