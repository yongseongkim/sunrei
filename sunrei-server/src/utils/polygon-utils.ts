export interface Point {
  latitude: number;
  longitude: number;
}

export function parseWKTPolygon(wkt: string): Point[] {
  const match = wkt.match(/POLYGON\s*\(\s*\(\s*([^)]+)\s*\)\s*\)/i);
  if (!match) {
    throw new Error('Invalid WKT polygon format');
  }
  
  const coordinatesStr = match[1];
  const points = coordinatesStr.split(',').map(coord => {
    const [lon, lat] = coord.trim().split(/\s+/).map(Number);
    return { latitude: lat, longitude: lon };
  });
  
  return points;
}

export function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;
    
    const intersect = ((yi > point.latitude) !== (yj > point.latitude))
        && (point.longitude < (xj - xi) * (point.latitude - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
}