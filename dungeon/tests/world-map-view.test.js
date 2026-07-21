import { CONFIG } from "../js/config.js";
import { createDefaultSave, sanitizeSave } from "../js/save.js";
import { listRegions } from "../js/world.js";
import {
  sanitizeWorldMapViewMode,
  getWorldMapLayout,
  resolveNodeMapPoint,
  buildWorldMapModel,
  renderWorldMapSvgMarkup,
  curvePath,
} from "../js/world-map-view.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "world map view mode sanitizes to map or list only",
    run() {
      assert(sanitizeWorldMapViewMode("map") === "map");
      assert(sanitizeWorldMapViewMode("list") === "list");
      assert(sanitizeWorldMapViewMode("wat") === "map");
      assert(sanitizeWorldMapViewMode(null) === "map");
    },
  },
  {
    name: "settings remember worldMapViewMode across sanitize",
    run() {
      const save = sanitizeSave({
        ...createDefaultSave(),
        settings: { worldMapViewMode: "list", soundEnabled: true },
      });
      assert(save.settings.worldMapViewMode === "list");
      const defaulted = createDefaultSave();
      assert(defaulted.settings.worldMapViewMode === "map");
      const legacy = sanitizeSave({
        version: 1,
        hero: { name: "旧", classId: "warrior", classChosen: true, level: 1 },
        progress: { highestUnlockedFloor: 2, clearedFloors: [1] },
      });
      assert(legacy.settings.worldMapViewMode === "map");
    },
  },
  {
    name: "map layout exposes viewBox edges and region shapes from config",
    run() {
      const layout = getWorldMapLayout(CONFIG);
      assert(Array.isArray(layout.viewBox) && layout.viewBox.length === 4);
      assert(layout.viewBox[2] > 0 && layout.viewBox[3] > 0);
      assert(layout.edges.length >= 3);
      assert(layout.regionShapes.forest?.path);
      assert(layout.regionShapes.desert?.path);
      assert(layout.decorations.length >= 1);
    },
  },
  {
    name: "resolveNodeMapPoint prefers mapX/mapY over x/y",
    run() {
      const point = resolveNodeMapPoint(
        { mapX: 150, mapY: 280, x: 10, y: 10 },
        [0, 0, 1000, 620],
      );
      assert(point.x === 150 && point.y === 280);
      const fallback = resolveNodeMapPoint({ x: 50, y: 50 }, [0, 0, 1000, 620]);
      assert(fallback.x === 500 && fallback.y === 310);
    },
  },
  {
    name: "buildWorldMapModel marks unlocked forest nodes and fog-ready locked regions",
    run() {
      const save = createDefaultSave();
      const regions = listRegions(save, CONFIG);
      const model = buildWorldMapModel(regions, {
        ...save.world,
        worldLevel: 1,
        currentNodeId: "forest_town",
        currentRegionId: "forest",
      }, CONFIG);
      assert(model.regions.length === 4);
      const forest = model.regions.find((region) => region.id === "forest");
      const desert = model.regions.find((region) => region.id === "desert");
      assert(forest?.unlocked === true);
      assert(desert?.unlocked === false);
      assert(forest?.nodes?.some((node) => node.id === "forest_town" && node.isCurrent));
      assert(model.edges.every((edge) => edge.visible === true || edge.from));
      assert(model.edges.filter((edge) => edge.visible).length >= 3);
      const town = forest.nodes.find((node) => node.id === "forest_town");
      assert(town.mapX === 200 && town.mapY === 300);
    },
  },
  {
    name: "SVG markup includes layers nodes aria labels and locked fog",
    run() {
      const save = createDefaultSave();
      const model = buildWorldMapModel(listRegions(save), save.world, CONFIG);
      const svg = renderWorldMapSvgMarkup(model, { reducedMotion: true });
      assert(svg.includes("<svg"));
      assert(svg.includes("wm-layer-regions"));
      assert(svg.includes("wm-layer-edges"));
      assert(svg.includes("wm-layer-nodes"));
      assert(svg.includes('data-world-node="forest_town"'));
      assert(svg.includes('role="button"'));
      assert(svg.includes("aria-label="));
      assert(svg.includes("wm-region-fog") || svg.includes("is-locked-region"));
      assert(svg.includes("is-reduced-motion"));
      assert(svg.includes("feTurbulence"));
      assert(svg.includes("wm-region-texture"));
      assert(svg.includes("wm-map-cartouche"));
      assert(svg.includes("wm-node-label-bg"));
      assert(svg.includes("wm-decor-tree") || svg.includes("wm-decor-mountain"));
    },
  },
  {
    name: "curvePath produces a quadratic bezier between two points",
    run() {
      const d = curvePath(0, 0, 100, 0);
      assert(d.startsWith("M0,0"));
      assert(d.includes("Q"));
      assert(d.endsWith("100,0") || d.includes("100,0"));
    },
  },
];
