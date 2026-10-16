/**
 * Gwangju Bus Route Navigation & Path Finder Engine
 * Author: Antigravity
 * Note: Pure client-side transit routing (Direct & 1-Transfer), without travel time estimation.
 */

(function (window) {
  'use strict';

  // Haversine distance in meters
  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  class BusRouter {
    constructor() {
      this.routeData = null;
      this.stopNameToPoints = new Map(); // normalized stopName -> [ { routeName, route, pointIndex, point } ]
      this.uniqueStops = []; // [ { name, arsId, lat, lng, routesCount } ]
      this.isInitialized = false;
    }

    /**
     * Initialize router index from routeData
     */
    init(routeData) {
      if (!routeData || !routeData.routes) return;
      this.routeData = routeData;
      this.stopNameToPoints.clear();
      this.uniqueStops = [];

      const tempStopMap = new Map();

      for (const routeName in routeData.routes) {
        const route = routeData.routes[routeName];
        if (!route.points || !Array.isArray(route.points)) continue;

        route.points.forEach((pt, pIdx) => {
          // Only regular passenger stops can be used for transit boarding/alighting
          if (pt.type === '교차로') return;

          const normName = pt.name.trim();
          if (!this.stopNameToPoints.has(normName)) {
            this.stopNameToPoints.set(normName, []);
          }

          this.stopNameToPoints.get(normName).push({
            routeName: route.routeName,
            route: route,
            pointIndex: pIdx,
            point: pt
          });

          // Unique stop metadata for autocomplete
          if (!tempStopMap.has(normName)) {
            tempStopMap.set(normName, {
              name: normName,
              arsId: pt.arsId || '',
              lat: pt.lat,
              lng: pt.lng,
              routes: new Set([route.routeName])
            });
          } else {
            const entry = tempStopMap.get(normName);
            entry.routes.add(route.routeName);
            if (!entry.arsId && pt.arsId) entry.arsId = pt.arsId;
          }
        });
      }

      this.uniqueStops = Array.from(tempStopMap.values()).map(s => ({
        name: s.name,
        arsId: s.arsId,
        lat: s.lat,
        lng: s.lng,
        routesCount: s.routes.size,
        routes: Array.from(s.routes)
      }));

      this.isInitialized = true;
      console.log(`[BusRouter] Initialized index with ${this.stopNameToPoints.size} distinct stop names.`);
    }

    /**
     * Search stops for autocomplete
     */
    searchStops(query, limit = 15) {
      if (!query || !this.isInitialized) return [];
      const q = query.trim().toLowerCase();
      const results = [];

      for (const stop of this.uniqueStops) {
        const nameLower = stop.name.toLowerCase();
        let score = -1;

        if (nameLower === q) {
          score = 100;
        } else if (nameLower.startsWith(q)) {
          score = 80;
        } else if (nameLower.includes(q)) {
          score = 50;
        } else if (stop.arsId && (stop.arsId === q || stop.arsId.startsWith(q))) {
          score = 70;
        }

        if (score > 0) {
          results.push({ ...stop, score });
        }
      }

      results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.routesCount - a.routesCount;
      });

      return results.slice(0, limit);
    }

    /**
     * Find Paths (Direct & 1-Transfer)
     * @param {string} startName 
     * @param {string} endName 
     * @param {string} sortBy 'direct' | 'stops'
     * @param {number} maxResults Default 10
     */
    findPaths(startName, endName, sortBy = 'direct', maxResults = 10) {
      if (!this.isInitialized || !startName || !endName) return [];

      const normStart = startName.trim();
      const normEnd = endName.trim();

      if (normStart === normEnd) {
        return [];
      }

      const startOccurrences = this.stopNameToPoints.get(normStart) || [];
      const endOccurrences = this.stopNameToPoints.get(normEnd) || [];

      if (startOccurrences.length === 0 || endOccurrences.length === 0) {
        return [];
      }

      const paths = [];
      const directPaths = this._findDirectPaths(startOccurrences, endOccurrences);
      paths.push(...directPaths);

      // Search 1-Transfer paths
      const transferPaths = this._findTransferPaths(startOccurrences, endOccurrences);
      paths.push(...transferPaths);

      // Sort paths: 직통 우선, 경유 정류장 수가 적은 순서 (기본값)
      paths.sort((a, b) => {
        if (sortBy === 'stops') {
          // 환승 무관 순수 경유 정류장 수 오름차순
          if (a.totalStops !== b.totalStops) return a.totalStops - b.totalStops;
          if (a.transfers !== b.transfers) return a.transfers - b.transfers;
          return a.walkDistance - b.walkDistance;
        } else {
          // 직통 우선 (transfers 적은 순: 0회 -> 1회)
          if (a.transfers !== b.transfers) return a.transfers - b.transfers;
          // 경유 정류장 수가 적은 순서
          if (a.totalStops !== b.totalStops) return a.totalStops - b.totalStops;
          // 도보 환승 거리가 짧은 순서
          return a.walkDistance - b.walkDistance;
        }
      });

      // 최대 10개 결과 반환
      return paths.slice(0, maxResults);
    }

    /**
     * 1. Direct Routes (0 Transfers)
     */
    _findDirectPaths(startOccurrences, endOccurrences) {
      const results = [];
      const seenRoutes = new Set();

      for (const sOcc of startOccurrences) {
        for (const eOcc of endOccurrences) {
          if (sOcc.routeName === eOcc.routeName) {
            // Must travel in the correct forward order
            if (sOcc.pointIndex < eOcc.pointIndex) {
              const route = sOcc.route;
              const routeName = route.routeName;
              const stopCount = eOcc.pointIndex - sOcc.pointIndex;

              // If multiple boarding/alighting pairs exist for the same route, pick the shortest
              if (seenRoutes.has(routeName)) continue;
              seenRoutes.add(routeName);

              const subPoints = route.points.slice(sOcc.pointIndex, eOcc.pointIndex + 1);
              const passengerStops = subPoints.filter(p => p.type !== '교차로');

              results.push({
                type: 'direct',
                transfers: 0,
                totalStops: passengerStops.length - 1, // Number of stops moved
                walkDistance: 0,
                legs: [
                  {
                    route: {
                      name: route.routeName,
                      type: route.routeType,
                      color: route.routeColor,
                      badge: route.routeBadge,
                      id: route.routeId
                    },
                    startStop: sOcc.point,
                    endStop: eOcc.point,
                    stopCount: passengerStops.length - 1,
                    stops: passengerStops,
                    points: subPoints
                  }
                ]
              });
            }
          }
        }
      }

      return results;
    }

    /**
     * 2. One-Transfer Routes (1 Transfer)
     */
    _findTransferPaths(startOccurrences, endOccurrences) {
      const results = [];
      const bestPairMap = new Map(); // key: `${route1}-${route2}` -> best path

      // Direct routes already found to avoid redundant transfers with same routes
      const directRouteSet = new Set(startOccurrences.map(s => s.routeName));

      for (const sOcc of startOccurrences) {
        const route1 = sOcc.route;
        const r1Points = route1.points;
        const sIdx = sOcc.pointIndex;

        for (const eOcc of endOccurrences) {
          const route2 = eOcc.route;
          const r2Points = route2.points;
          const eIdx = eOcc.pointIndex;

          if (route1.routeName === route2.routeName) continue;

          const pairKey = `${route1.routeName}➔${route2.routeName}`;

          // Check all downstream stops of Route 1 from sIdx + 1
          for (let i = sIdx + 1; i < r1Points.length; i++) {
            const p1 = r1Points[i];
            if (p1.type === '교차로') continue;

            // Check all upstream stops of Route 2 prior to eIdx
            for (let j = 0; j < eIdx; j++) {
              const p2 = r2Points[j];
              if (p2.type === '교차로') continue;

              let isTransfer = false;
              let walkDist = 0;

              // Case A: Identical stop name (Same station transfer)
              if (p1.name.trim() === p2.name.trim()) {
                isTransfer = true;
                walkDist = haversineMeters(p1.lat, p1.lng, p2.lat, p2.lng);
              } 
              // Case B: Nearby stop (Walking transfer within 300 meters)
              else {
                const dist = haversineMeters(p1.lat, p1.lng, p2.lat, p2.lng);
                if (dist <= 300) {
                  isTransfer = true;
                  walkDist = dist;
                }
              }

              if (isTransfer) {
                const r1Sub = r1Points.slice(sIdx, i + 1);
                const r2Sub = r2Points.slice(j, eIdx + 1);

                const r1Stops = r1Sub.filter(p => p.type !== '교차로');
                const r2Stops = r2Sub.filter(p => p.type !== '교차로');

                const leg1StopCount = r1Stops.length - 1;
                const leg2StopCount = r2Stops.length - 1;
                const totalStops = leg1StopCount + leg2StopCount;

                // Ignore excessively long roundabout paths (> 45 stops)
                if (totalStops > 45) continue;

                const candidate = {
                  type: 'transfer',
                  transfers: 1,
                  totalStops: totalStops,
                  walkDistance: walkDist,
                  transferStopName: p1.name.trim() === p2.name.trim() ? p1.name.trim() : `${p1.name} ➔ ${p2.name}`,
                  transferFromStop: p1,
                  transferToStop: p2,
                  isSameStop: p1.name.trim() === p2.name.trim(),
                  legs: [
                    {
                      route: {
                        name: route1.routeName,
                        type: route1.routeType,
                        color: route1.routeColor,
                        badge: route1.routeBadge,
                        id: route1.routeId
                      },
                      startStop: sOcc.point,
                      endStop: p1,
                      stopCount: leg1StopCount,
                      stops: r1Stops,
                      points: r1Sub
                    },
                    {
                      route: {
                        name: route2.routeName,
                        type: route2.routeType,
                        color: route2.routeColor,
                        badge: route2.routeBadge,
                        id: route2.routeId
                      },
                      startStop: p2,
                      endStop: eOcc.point,
                      stopCount: leg2StopCount,
                      stops: r2Stops,
                      points: r2Sub
                    }
                  ]
                };

                // Keep only the best transfer location for this route pair
                if (!bestPairMap.has(pairKey)) {
                  bestPairMap.set(pairKey, candidate);
                } else {
                  const existing = bestPairMap.get(pairKey);
                  if (candidate.totalStops < existing.totalStops || 
                     (candidate.totalStops === existing.totalStops && candidate.walkDistance < existing.walkDistance)) {
                    bestPairMap.set(pairKey, candidate);
                  }
                }
              }
            }
          }
        }
      }

      return Array.from(bestPairMap.values());
    }
  }

  // Export to global scope
  window.BusRouter = new BusRouter();

})(window);
