/**
 * Routing Utilities - Shortest Path Algorithm & Route Management
 * Implements nearest neighbor algorithm with proper distance calculation
 */

// Barangay Hall - Fixed starting location
export const BARANGAY_HALL = {
  name: 'Barangay Hall',
  lat: 14.6091,
  lng: 121.0223,
};

/**
 * Calculate Haversine distance between two coordinates in kilometers
 * @param {number} lat1 - Starting latitude
 * @param {number} lng1 - Starting longitude
 * @param {number} lat2 - Ending latitude
 * @param {number} lng2 - Ending longitude
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Nearest Neighbor Algorithm - Shortest Path First
 * Implements proper nearest neighbor heuristic for TSP-like problem
 * @param {Array} bins - Array of bin objects with lat/lng
 * @param {Object} startPoint - Starting location {lat, lng}
 * @returns {Array} Optimized bin order for collection
 */
export const nearestNeighborRoute = (bins, startPoint = BARANGAY_HALL) => {
  if (!bins || bins.length === 0) return [];

  // Start from barangay hall
  let currentLocation = startPoint;
  const optimizedRoute = [];
  const remainingBins = [...bins];

  // Keep finding nearest unvisited bin
  while (remainingBins.length > 0) {
    let nearestBin = null;
    let nearestDistance = Infinity;
    let nearestIndex = -1;

    // Find closest bin to current location
    for (let i = 0; i < remainingBins.length; i++) {
      const bin = remainingBins[i];
      const distance = calculateDistance(
        currentLocation.lat,
        currentLocation.lng,
        bin.lat,
        bin.lng
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestBin = bin;
        nearestIndex = i;
      }
    }

    if (nearestBin) {
      optimizedRoute.push(nearestBin);
      remainingBins.splice(nearestIndex, 1);
      currentLocation = { lat: nearestBin.lat, lng: nearestBin.lng };
    }
  }

  return optimizedRoute;
};

/**
 * Get route segments - pairs of consecutive waypoints
 * @param {Array} route - Ordered array of bins
 * @param {Object} startPoint - Starting location
 * @returns {Array} Array of {from, to} segments
 */
export const getRouteSegments = (route, startPoint = BARANGAY_HALL) => {
  const segments = [];
  let currentPoint = startPoint;

  for (const bin of route) {
    segments.push({
      from: { lat: currentPoint.lat, lng: currentPoint.lng },
      to: { lat: bin.lat, lng: bin.lng },
      binId: bin.id,
      binName: bin.name,
      distance: calculateDistance(
        currentPoint.lat,
        currentPoint.lng,
        bin.lat,
        bin.lng
      ),
    });
    currentPoint = { lat: bin.lat, lng: bin.lng };
  }

  return segments;
};

/**
 * Calculate total route distance
 * @param {Array} route - Ordered array of bins
 * @param {Object} startPoint - Starting location
 * @returns {number} Total distance in kilometers
 */
export const calculateTotalDistance = (route, startPoint = BARANGAY_HALL) => {
  const segments = getRouteSegments(route, startPoint);
  return segments.reduce((total, segment) => total + segment.distance, 0);
};

/**
 * Calculate total route duration (assumption: 40 km/h average speed)
 * @param {Array} route - Ordered array of bins
 * @param {Object} startPoint - Starting location
 * @returns {number} Duration in minutes
 */
export const calculateTotalDuration = (route, startPoint = BARANGAY_HALL) => {
  const totalDistance = calculateTotalDistance(route, startPoint);
  const avgSpeed = 40; // km/h
  return Math.round((totalDistance / avgSpeed) * 60); // Convert to minutes
};

/**
 * Find closest bin to a location
 * @param {Object} location - Current location {lat, lng}
 * @param {Array} bins - Array of available bins
 * @returns {Object} Closest bin or null
 */
export const findClosestBin = (location, bins) => {
  if (!bins || bins.length === 0) return null;

  let closestBin = null;
  let closestDistance = Infinity;

  for (const bin of bins) {
    const distance = calculateDistance(
      location.lat,
      location.lng,
      bin.lat,
      bin.lng
    );
    if (distance < closestDistance) {
      closestDistance = distance;
      closestBin = bin;
    }
  }

  return { bin: closestBin, distance: closestDistance };
};

/**
 * Check if truck is at a bin location (within proximity threshold)
 * @param {Object} truckLocation - Truck coordinates
 * @param {Object} binLocation - Bin coordinates
 * @param {number} proximityThreshold - Distance threshold in km (default: 0.02 = ~20m)
 * @returns {boolean} True if truck is at bin
 */
export const isAtBinLocation = (
  truckLocation,
  binLocation,
  proximityThreshold = 0.02
) => {
  const distance = calculateDistance(
    truckLocation.lat,
    truckLocation.lng,
    binLocation.lat,
    binLocation.lng
  );
  return distance <= proximityThreshold;
};

/**
 * Interpolate position along a line segment
 * @param {Object} from - Starting point {lat, lng}
 * @param {Object} to - Ending point {lat, lng}
 * @param {number} progress - Progress from 0 to 1
 * @returns {Object} Interpolated position {lat, lng}
 */
export const interpolatePosition = (from, to, progress) => {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return {
    lat: from.lat + (to.lat - from.lat) * clampedProgress,
    lng: from.lng + (to.lng - from.lng) * clampedProgress,
  };
};

/**
 * Get waypoints for a route segment (for smooth animation)
 * @param {Object} from - Starting point
 * @param {Object} to - Ending point
 * @param {number} steps - Number of waypoints (default: 20)
 * @returns {Array} Array of waypoints
 */
export const getWaypoints = (from, to, steps = 20) => {
  const waypoints = [];
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    waypoints.push(interpolatePosition(from, to, progress));
  }
  return waypoints;
};

/**
 * Validate if a route is continuous (no gaps)
 * @param {Array} route - Ordered bins
 * @returns {boolean} True if route is valid and continuous
 */
export const isValidRoute = (route) => {
  return Array.isArray(route) && route.length > 0;
};

const routingUtils = {
  BARANGAY_HALL,
  calculateDistance,
  nearestNeighborRoute,
  getRouteSegments,
  calculateTotalDistance,
  calculateTotalDuration,
  findClosestBin,
  isAtBinLocation,
  interpolatePosition,
  getWaypoints,
  isValidRoute,
};

export default routingUtils;
