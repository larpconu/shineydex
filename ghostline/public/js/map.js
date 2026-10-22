// Leaflet helpers: dark CARTO tiles (OpenStreetMap data), zone circles, keyed HTML markers.
const Lf = () => window.L;

export const TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const DEFAULT_CENTER = { lat: 37.7596, lng: -122.4269 };

export function makeMap(el, { center = DEFAULT_CENTER, zoom = 15, interactive = true } = {}) {
  const L = Lf();
  const map = L.map(el, {
    zoomControl: false, attributionControl: true, dragging: interactive, touchZoom: interactive, scrollWheelZoom: interactive,
    doubleClickZoom: interactive, boxZoom: false, keyboard: false, tap: false, zoomSnap: 0.25, inertia: true,
  });
  L.tileLayer(TILES, {
    subdomains: 'abcd', maxZoom: 20, detectRetina: true, crossOrigin: true,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.setView([center.lat, center.lng], zoom);
  setTimeout(() => map.invalidateSize(), 50);
  return map;
}

export function zoomForRadius(map, radius) {
  const L = Lf();
  const c = map.getCenter();
  const b = L.latLng(c).toBounds(radius * 2.3);
  return map.getBoundsZoom(b);
}

export function zoneLayers(map) {
  const L = Lf();
  const cur = L.circle([0, 0], { radius: 1, color: '#38E1FF', weight: 2.5, opacity: 0.95, fillColor: '#38E1FF', fillOpacity: 0.06, interactive: false });
  const next = L.circle([0, 0], { radius: 1, color: '#38E1FF', weight: 2, opacity: 0.9, dashArray: '8 10', fill: false, interactive: false });
  return {
    setZone(z) {
      if (!z) { cur.remove(); return; }
      cur.setLatLng([z.lat, z.lng]).setRadius(z.radius);
      if (!map.hasLayer(cur)) cur.addTo(map);
    },
    setNext(z) {
      if (!z) { next.remove(); return; }
      next.setLatLng([z.lat, z.lng]).setRadius(z.radius);
      if (!map.hasLayer(next)) next.addTo(map);
    },
    fit(z, pad = 40) {
      map.fitBounds(L.latLng(z.lat, z.lng).toBounds(z.radius * 2), { padding: [pad, pad] });
    },
  };
}

// Keyed markers whose inner HTML we can patch every second (age counters) without re-creating them.
export function markerSet(map) {
  const L = Lf();
  const items = new Map();
  return {
    sync(list) {
      const seen = new Set();
      for (const m of list) {
        seen.add(m.id);
        let it = items.get(m.id);
        if (!it) {
          const icon = L.divIcon({ className: '', html: m.html, iconSize: [0, 0] });
          const mk = L.marker([m.lat, m.lng], { icon, interactive: !!m.onClick, keyboard: false, zIndexOffset: m.z || 0 }).addTo(map);
          if (m.onClick) mk.on('click', m.onClick);
          it = { mk, html: m.html };
          items.set(m.id, it);
        } else {
          it.mk.setLatLng([m.lat, m.lng]);
          if (m.html !== it.html) {
            const node = it.mk.getElement();
            if (node) node.innerHTML = m.html; else it.mk.setIcon(L.divIcon({ className: '', html: m.html, iconSize: [0, 0] }));
            it.html = m.html;
          }
          if (m.z != null) it.mk.setZIndexOffset(m.z);
        }
      }
      for (const [id, it] of items) if (!seen.has(id)) { it.mk.remove(); items.delete(id); }
    },
    clear() { for (const it of items.values()) it.mk.remove(); items.clear(); },
  };
}
