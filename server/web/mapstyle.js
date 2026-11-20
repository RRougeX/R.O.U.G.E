// Offline map style for Protomaps basemap tiles (PMTiles, v4 schema).
// Neutral colours to match the interface; light and dark versions.
window.rougeMapStyle = function (pmtilesUrl, dark) {
  const c = dark ? {
    bg: "#0f1012", earth: "#17181b", water: "#0b2233", waterLine: "#16405c", park: "#14251a", forest: "#132317",
    urban: "#1c1d21", building: "#24262b", hospital: "#2a1a1d", sand: "#22201a", ice: "#1f2933",
    boundary: "#5b6170", road: "#3a3d45", major: "#585d68", highway: "#8a6a3a", casing: "#0f1012", path: "#4a4e57",
    text: "#d4d4d8", textHalo: "#0f1012", place: "#f4f4f5", waterText: "#5b9bc4", poi: "#a1a1aa", poiImportant: "#f87171"
  } : {
    bg: "#f4f4f5", earth: "#f4f4f2", water: "#a8d0e6", waterLine: "#8fc2df", park: "#d8ead2", forest: "#cfe3c6",
    urban: "#eceae6", building: "#e2ddd6", hospital: "#f4dede", sand: "#f1ead8", ice: "#f5f9fb",
    boundary: "#9a8fb0", road: "#ffffff", major: "#ffffff", highway: "#fbd38d", casing: "#d4d4d8", path: "#b8b8bf",
    text: "#3f3f46", textHalo: "#ffffff", place: "#18181b", waterText: "#3b7ca3", poi: "#52525b", poiImportant: "#dc2626"
  };
  const name = ["coalesce", ["get", "name:en"], ["get", "name"]];
  const kind = ["get", "kind"];
  const polygon = ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]];
  const line = ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]];
  const font = ["Noto Sans Regular"];
  const fontBold = ["Noto Sans Medium"];
  // zoom must be the outermost expression, so the casing's extra width is baked into each stop
  const roadWidth = (base, extra = 0) => ["interpolate", ["exponential", 1.6], ["zoom"],
    5, base * 0.25 + extra * 0.5, 10, base * 0.8 + extra, 14, base * 3 + extra, 18, base * 18 + extra * 2];

  return {
    version: 8,
    glyphs: "/assets/fonts/{fontstack}/{range}.pbf",
    sources: { base: { type: "vector", url: "pmtiles://" + pmtilesUrl, attribution: "© OpenStreetMap contributors · Protomaps" } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": c.bg } },
      { id: "earth", type: "fill", source: "base", "source-layer": "earth", paint: { "fill-color": c.earth } },
      { id: "landcover", type: "fill", source: "base", "source-layer": "landcover",
        paint: { "fill-color": ["match", kind, ["forest", "wood"], c.forest, ["grassland", "scrub", "farmland"], c.park,
          ["barren", "sand"], c.sand, "glacier", c.ice, "urban_area", c.urban, c.earth], "fill-opacity": 0.7 } },
      { id: "landuse", type: "fill", source: "base", "source-layer": "landuse",
        paint: { "fill-color": ["match", kind, ["park", "nature_reserve", "national_park", "protected_area", "garden", "golf_course", "playground", "cemetery", "grass", "meadow"], c.park,
          ["wood", "forest"], c.forest, ["hospital", "clinic"], c.hospital, ["beach", "sand"], c.sand, c.urban], "fill-opacity": 0.75 } },
      { id: "water", type: "fill", source: "base", "source-layer": "water", filter: polygon, paint: { "fill-color": c.water } },
      { id: "water-lines", type: "line", source: "base", "source-layer": "water", filter: line,
        paint: { "line-color": c.waterLine, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 2, 18, 6] } },
      { id: "buildings", type: "fill", source: "base", "source-layer": "buildings", minzoom: 13,
        paint: { "fill-color": c.building, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 0.9] } },
      { id: "boundaries", type: "line", source: "base", "source-layer": "boundaries",
        paint: { "line-color": c.boundary, "line-width": ["match", kind, "country", 1.4, 0.8], "line-dasharray": [3, 2] } },

      { id: "roads-path", type: "line", source: "base", "source-layer": "roads", minzoom: 13,
        filter: ["==", kind, "path"], paint: { "line-color": c.path, "line-width": 1, "line-dasharray": [2, 1.5] } },
      { id: "roads-minor-casing", type: "line", source: "base", "source-layer": "roads", minzoom: 12,
        filter: ["in", kind, ["literal", ["minor_road", "other"]]], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": c.casing, "line-width": roadWidth(0.9, 1.5) } },
      { id: "roads-minor", type: "line", source: "base", "source-layer": "roads", minzoom: 11,
        filter: ["in", kind, ["literal", ["minor_road", "other"]]], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": c.road, "line-width": roadWidth(0.9) } },
      { id: "roads-major-casing", type: "line", source: "base", "source-layer": "roads", minzoom: 9,
        filter: ["in", kind, ["literal", ["major_road", "medium_road"]]], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": c.casing, "line-width": roadWidth(1.4, 1.5) } },
      { id: "roads-major", type: "line", source: "base", "source-layer": "roads", minzoom: 6,
        filter: ["in", kind, ["literal", ["major_road", "medium_road"]]], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": c.major, "line-width": roadWidth(1.4) } },
      { id: "roads-highway-casing", type: "line", source: "base", "source-layer": "roads", minzoom: 7,
        filter: ["==", kind, "highway"], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": c.casing, "line-width": roadWidth(2, 1.5) } },
      { id: "roads-highway", type: "line", source: "base", "source-layer": "roads", minzoom: 4,
        filter: ["==", kind, "highway"], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": c.highway, "line-width": roadWidth(2) } },

      { id: "water-labels", type: "symbol", source: "base", "source-layer": "water", minzoom: 6, filter: polygon,
        layout: { "text-field": name, "text-font": ["Noto Sans Italic"], "text-size": 12, "text-max-width": 8 },
        paint: { "text-color": c.waterText, "text-halo-color": c.textHalo, "text-halo-width": 1 } },
      { id: "road-labels", type: "symbol", source: "base", "source-layer": "roads", minzoom: 13,
        layout: { "symbol-placement": "line", "text-field": name, "text-font": font, "text-size": 11.5 },
        paint: { "text-color": c.text, "text-halo-color": c.textHalo, "text-halo-width": 1.5 } },
      { id: "pois-important", type: "symbol", source: "base", "source-layer": "pois", minzoom: 12,
        filter: ["in", kind, ["literal", ["hospital", "clinic", "pharmacy", "doctors", "fire_station", "police", "shelter", "drinking_water", "fuel", "ranger_station"]]],
        layout: { "text-field": ["concat", "+ ", name], "text-font": fontBold, "text-size": 11.5, "text-max-width": 9 },
        paint: { "text-color": c.poiImportant, "text-halo-color": c.textHalo, "text-halo-width": 1.5 } },
      { id: "pois", type: "symbol", source: "base", "source-layer": "pois", minzoom: 15,
        layout: { "text-field": name, "text-font": font, "text-size": 11, "text-max-width": 9 },
        paint: { "text-color": c.poi, "text-halo-color": c.textHalo, "text-halo-width": 1.5 } },
      { id: "places-minor", type: "symbol", source: "base", "source-layer": "places", minzoom: 9,
        filter: ["in", kind, ["literal", ["neighbourhood", "macrohood", "microhood", "hamlet"]]],
        layout: { "text-field": name, "text-font": font, "text-size": 11.5, "text-transform": "uppercase", "text-letter-spacing": 0.08, "text-max-width": 8 },
        paint: { "text-color": c.poi, "text-halo-color": c.textHalo, "text-halo-width": 1.5 } },
      { id: "places-locality", type: "symbol", source: "base", "source-layer": "places",
        filter: ["==", kind, "locality"],
        layout: { "text-field": name, "text-font": fontBold, "text-max-width": 8,
          "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 10, 14, 14, 17] },
        paint: { "text-color": c.place, "text-halo-color": c.textHalo, "text-halo-width": 1.8 } },
      { id: "places-region", type: "symbol", source: "base", "source-layer": "places", maxzoom: 8,
        filter: ["==", kind, "region"],
        layout: { "text-field": name, "text-font": font, "text-size": 12, "text-transform": "uppercase", "text-letter-spacing": 0.12 },
        paint: { "text-color": c.poi, "text-halo-color": c.textHalo, "text-halo-width": 1.5 } },
      { id: "places-country", type: "symbol", source: "base", "source-layer": "places", maxzoom: 7,
        filter: ["==", kind, "country"],
        layout: { "text-field": name, "text-font": fontBold, "text-size": 14 },
        paint: { "text-color": c.place, "text-halo-color": c.textHalo, "text-halo-width": 2 } }
    ]
  };
};
