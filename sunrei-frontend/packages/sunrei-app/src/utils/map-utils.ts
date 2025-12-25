export function boundsToWKTPolygon(bounds: google.maps.LatLngBounds): string {
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  
  // Create a polygon from the bounds (clockwise order)
  const coords = [
    `${sw.lng()} ${sw.lat()}`,  // SW corner
    `${ne.lng()} ${sw.lat()}`,  // SE corner
    `${ne.lng()} ${ne.lat()}`,  // NE corner
    `${sw.lng()} ${ne.lat()}`,  // NW corner
    `${sw.lng()} ${sw.lat()}`   // Close the polygon
  ].join(', ');
  
  return `POLYGON((${coords}))`;
}
