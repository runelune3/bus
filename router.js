/**
 * Gwangju Bus Route Navigation & Path Finder Engine
 * Author: Antigravity
 * Note: Pure client-side transit routing (Direct & 1-Transfer), without travel time estimation.
 * Features: ARS platform-based search & strictly excludes terminus/turnaround arrivals & pass-throughs.
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

  // Crossroad / Intersection detector: strictly exclude from passenger stops and routing
  function isIntersection(pt) {
    if (!pt) return false;
    if (pt.type === '교차로') return true;
    if (pt.name === '교차로' && !pt.arsId) return true;
    return false;
  }

  class BusRouter {
    constructor() {
      this.routeData = null;
      this.pointsByArs = new Map(); // arsId -> [ { routeName, route, pointIndex, point } ]
      this.pointsByName = new Map(); // normalized stopName -> [ { routeName, route, pointIndex, point } ]
      this.arsToStopName = new Map(); // arsId -> normalized stopName
      this.stopCatalog = []; // [ { name, arsId, direction, lat, lng, routesCount, routes } ]
      this.isInitialized = false;
    }

    /**
     * Initialize router index from routeData
     */
    init(routeData) {
      if (!routeData || !routeData.routes) return;
      this.routeData = routeData;
      this.pointsByArs.clear();
      this.pointsByName.clear();
      this.arsToStopName.clear();
      this.stopCatalog = [];

      const platformMap = new Map(); // key: `${normName}__${normArs}`

      for (const routeName in routeData.routes) {
        const route = routeData.routes[routeName];
        if (!route.points || !Array.isArray(route.points)) continue;

        route.points.forEach((pt, pIdx) => {
          // Only regular passenger stops can be used for transit boarding/alighting (exclude crossroads)
          if (isIntersection(pt)) return;

          const normName = (pt.name || '').trim();
          if (!normName) return;

          const normArs = String(pt.arsId || '').trim();
          const occurrence = {
            routeName: route.routeName,
            route: route,
            pointIndex: pIdx,
            point: pt
          };

          // 1. Index by Stop Name
          if (!this.pointsByName.has(normName)) {
            this.pointsByName.set(normName, []);
          }
          this.pointsByName.get(normName).push(occurrence);

          // 2. Index by ARS ID
          if (normArs) {
            if (!this.pointsByArs.has(normArs)) {
              this.pointsByArs.set(normArs, []);
            }
            this.pointsByArs.get(normArs).push(occurrence);

            this.arsToStopName.set(normArs, normName);

            // Also index numeric without leading zeros
            const numVal = parseInt(normArs, 10);
            if (!isNaN(numVal)) {
              const numStr = String(numVal);
              if (numStr !== normArs) {
                if (!this.pointsByArs.has(numStr)) {
                  this.pointsByArs.set(numStr, []);
                }
                this.pointsByArs.get(numStr).push(occurrence);
                this.arsToStopName.set(numStr, normName);
              }
            }
          }

          // 3. Platform-level Catalog (distinguishes individual ARS platforms like 2232 and 2233)
          const platformKey = `${normName}__${normArs}`;
          if (!platformMap.has(platformKey)) {
            platformMap.set(platformKey, {
              name: normName,
              arsId: normArs,
              direction: pt.direction || '',
              lat: pt.lat,
              lng: pt.lng,
              routes: new Set([route.routeName])
            });
          } else {
            platformMap.get(platformKey).routes.add(route.routeName);
          }
        });
      }

      this.stopCatalog = Array.from(platformMap.values()).map(p => ({
        name: p.name,
        arsId: p.arsId,
        direction: p.direction,
        lat: p.lat,
        lng: p.lng,
        routesCount: p.routes.size,
        routes: Array.from(p.routes)
      }));

      this.isInitialized = true;
      console.log(`[BusRouter] Initialized ARS-based index with ${this.stopCatalog.length} platforms, ${this.pointsByName.size} unique stop names, and ${this.pointsByArs.size} ARS indices.`);
    }

    /**
     * Search stops for autocomplete (Pure text & ARS ID matching, NO chosung)
     */
    searchStops(query, limit = 15) {
      if (!query || !this.isInitialized) return [];
      const q = query.trim().toLowerCase();
      if (!q) return [];

      const isNum = /^\d+$/.test(q);
      const numVal = isNum ? parseInt(q, 10) : null;
      const results = [];

      for (const stop of this.stopCatalog) {
        const nameLower = stop.name.toLowerCase();
        const ars = stop.arsId || '';
        const arsLower = ars.toLowerCase();
        const arsNum = ars ? parseInt(ars, 10) : null;

        let score = -1;
        let matchedArs = null;

        // 1. ARS Matching
        if (ars) {
          if (arsLower === q || (numVal !== null && arsNum === numVal)) {
            score = 100;
            matchedArs = ars;
          } else if (arsLower.startsWith(q)) {
            score = 85;
            matchedArs = ars;
          } else if (arsLower.includes(q)) {
            score = 65;
            matchedArs = ars;
          }
        }

        // 2. Name Matching (Exact / Prefix / Substring, without chosung)
        if (nameLower === q) {
          score = Math.max(score, 95);
        } else if (nameLower.startsWith(q)) {
          score = Math.max(score, 90);
        } else if (nameLower.includes(q)) {
          score = Math.max(score, 70);
        }

        if (score > 0) {
          results.push({
            name: stop.name,
            arsId: stop.arsId,
            direction: stop.direction,
            lat: stop.lat,
            lng: stop.lng,
            routesCount: stop.routesCount,
            routes: stop.routes,
            matchedArs: matchedArs || stop.arsId || '',
            score: score
          });
        }
      }

      // Sort: highest score -> stop name -> ARS ID ascending
      results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.name !== b.name) return a.name.localeCompare(b.name, 'ko');
        return (a.arsId || '').localeCompare(b.arsId || '');
      });

      return results.slice(0, limit);
    }

    /**
     * Resolve any stop name or ARS ID (e.g. "2233", "2233번", "시청광주청사 (2233)") to canonical stop name
     */
    resolveStopName(query) {
      if (!query || !this.isInitialized) return (query || '').trim();
      let q = String(query).trim();
      const parenMatch = q.match(/^(.+?)\s*\(\d+\)$/);
      if (parenMatch) {
        return parenMatch[1].trim();
      }
      if (this.arsToStopName.has(q)) {
        return this.arsToStopName.get(q);
      }
      const numOnly = q.replace(/[^0-9]/g, '');
      if (numOnly) {
        if (this.arsToStopName.has(numOnly)) {
          return this.arsToStopName.get(numOnly);
        }
        const numVal = parseInt(numOnly, 10);
        if (!isNaN(numVal) && this.arsToStopName.has(String(numVal))) {
          return this.arsToStopName.get(String(numVal));
        }
      }
      return q;
    }

    /**
     * Resolve search string to stop occurrences (ARS-first priority)
     * e.g. "시청광주청사 (2233)", "2233", "2233번", "시청광주청사"
     */
    getOccurrences(query) {
      if (!query || !this.isInitialized) return [];
      const q = String(query).trim();
      if (!q) return [];

      // 1. Check parenthesized ARS: "시청광주청사 (2233)" -> "2233"
      const parenMatch = q.match(/\((\d{4,5}|\d+)\)/);
      if (parenMatch) {
        const ars = parenMatch[1];
        if (this.pointsByArs.has(ars)) {
          return this.pointsByArs.get(ars);
        }
      }

      // 2. Pure digits: "2233"
      const digitsOnly = q.replace(/[^0-9]/g, '');
      if (digitsOnly && /^\d+$/.test(q)) {
        if (this.pointsByArs.has(digitsOnly)) {
          return this.pointsByArs.get(digitsOnly);
        }
        const numVal = parseInt(digitsOnly, 10);
        if (!isNaN(numVal) && this.pointsByArs.has(String(numVal))) {
          return this.pointsByArs.get(String(numVal));
        }
      }

      // 3. Fallback to Stop Name (strip any trailing parenthesis)
      const cleanName = q.replace(/\s*\(\d+\)$/, '').trim();
      if (this.pointsByName.has(cleanName)) {
        return this.pointsByName.get(cleanName);
      }

      // 4. Try ARS to Stop Name mapping
      if (this.arsToStopName.has(q)) {
        const mappedName = this.arsToStopName.get(q);
        return this.pointsByName.get(mappedName) || [];
      }

      return [];
    }

    /**
     * Strictly validate passenger transit leg:
     * - Must not reach terminus/turnaround (도착 정류소가 기점/종점/회차지인 경로 제외)
     * - Must not arrive at the very end of route points (노선의 마지막 종점 정류소 도달 제외)
     * - Must not travel across direction change (상행 탑승 -> 하행 도착 비현실적 경로 제외)
     * - Must not cross any terminus/turnaround in intermediate stops (기점/종점/회차지 통과 제외)
     */
    isValidTransitLeg(sOcc, eOcc) {
      if (sOcc.routeName !== eOcc.routeName) return false;
      if (sOcc.pointIndex >= eOcc.pointIndex) return false;

      const startPt = sOcc.point;
      const endPt = eOcc.point;
      const route = sOcc.route;
      const points = route.points;

      // 1. Exclude reaching origin or terminus (기점, 종점, 회차지 도달 제외)
      if (endPt.type === '기점' || endPt.type === '종점' || endPt.type === '회차지') {
        return false;
      }

      // 2. Exclude arriving at the final terminal index of the route
      if (eOcc.pointIndex === points.length - 1 || eOcc.pointIndex === 0) {
        return false;
      }

      // 3. Exclude cross-direction travel (e.g. boarding at 상행 and arriving at 하행 across turnaround)
      if (startPt.direction && endPt.direction && startPt.direction !== endPt.direction) {
        return false;
      }

      // 4. Exclude intermediate pass-through of terminus/turnaround
      for (let k = sOcc.pointIndex + 1; k < eOcc.pointIndex; k++) {
        const midPt = points[k];
        if (midPt.type === '회차지' || midPt.type === '종점' || midPt.type === '기점') {
          return false;
        }
      }

      return true;
    }

    /**
     * Find Paths (Direct, Direct-with-Short-Walk & 1-Transfer)
     * Prioritizes direct transit with short walk to destination over roundabout transfers.
     * @param {string} startQuery 
     * @param {string} endQuery 
     * @param {string} sortBy 'direct' | 'stops'
     * @param {number} maxResults Default 10
     */
    findPaths(startQuery, endQuery, sortBy = 'direct', maxResults = 10) {
      if (!this.isInitialized || !startQuery || !endQuery) return [];

      const startOccurrences = this.getOccurrences(startQuery);
      const endOccurrences = this.getOccurrences(endQuery);

      if (startOccurrences.length === 0 || endOccurrences.length === 0) {
        return [];
      }

      const paths = [];
      const seenDirectRoutes = new Set();

      // Target points for exact queries
      const targetStartPoint = startOccurrences[0].point;
      const targetEndPoint = endOccurrences[0].point;

      // 1. Exact Direct Paths (0 Transfers, 0m walk)
      const exactDirectPaths = this._findDirectPaths(startOccurrences, endOccurrences, 0, null, null, 0, 0);
      exactDirectPaths.forEach(p => {
        seenDirectRoutes.add(p.legs[0].route.name);
        paths.push(p);
      });

      // Find nearby start platforms (within 300m or same stop name)
      // e.g. from 2233 across the street to 2232 (31m)
      const nearbyStartPlatforms = [];
      for (const stop of this.stopCatalog) {
        if (stop.arsId && String(stop.arsId).trim() === String(targetStartPoint.arsId).trim()) continue;
        const dist = haversineMeters(stop.lat, stop.lng, targetStartPoint.lat, targetStartPoint.lng);
        if (dist <= 300 || (stop.name && stop.name.trim() === targetStartPoint.name.trim())) {
          nearbyStartPlatforms.push({ stop, dist });
        }
      }
      nearbyStartPlatforms.sort((a, b) => a.dist - b.dist);

      // Find nearby end platforms (within 300m or same stop name)
      // e.g. when destination has a nearby alighting platform like 2002 across street from 2001 or 발산마을
      const nearbyEndPlatforms = [];
      for (const stop of this.stopCatalog) {
        if (stop.arsId && String(stop.arsId).trim() === String(targetEndPoint.arsId).trim()) continue;
        const dist = haversineMeters(stop.lat, stop.lng, targetEndPoint.lat, targetEndPoint.lng);
        if (dist <= 300 || (stop.name && stop.name.trim() === targetEndPoint.name.trim())) {
          nearbyEndPlatforms.push({ stop, dist });
        }
      }
      nearbyEndPlatforms.sort((a, b) => a.dist - b.dist);

      // 2. Direct Paths with short walk from departure (nearbyStart -> exactEnd)
      for (const { stop, dist } of nearbyStartPlatforms) {
        const nearbyOccs = (stop.arsId && this.pointsByArs.get(stop.arsId)) || this.pointsByName.get(stop.name) || [];
        if (nearbyOccs.length === 0) continue;

        const nearbyDirect = this._findDirectPaths(nearbyOccs, endOccurrences, dist, null, targetStartPoint, dist, 0);
        for (const p of nearbyDirect) {
          const rName = p.legs[0].route.name;
          if (!seenDirectRoutes.has(rName)) {
            seenDirectRoutes.add(rName);
            paths.push(p);
          }
        }
      }

      // 3. Direct Paths with short walk to destination (exactStart -> nearbyEnd)
      for (const { stop, dist } of nearbyEndPlatforms) {
        const nearbyOccs = (stop.arsId && this.pointsByArs.get(stop.arsId)) || this.pointsByName.get(stop.name) || [];
        if (nearbyOccs.length === 0) continue;

        const nearbyDirect = this._findDirectPaths(startOccurrences, nearbyOccs, dist, targetEndPoint, null, 0, dist);
        for (const p of nearbyDirect) {
          const rName = p.legs[0].route.name;
          if (!seenDirectRoutes.has(rName)) {
            seenDirectRoutes.add(rName);
            paths.push(p);
          }
        }
      }

      // 4. Direct Paths with short walk at BOTH ends (nearbyStart -> nearbyEnd)
      for (const { stop: sStop, dist: sDist } of nearbyStartPlatforms) {
        const sOccs = (sStop.arsId && this.pointsByArs.get(sStop.arsId)) || this.pointsByName.get(sStop.name) || [];
        if (sOccs.length === 0) continue;

        for (const { stop: eStop, dist: eDist } of nearbyEndPlatforms) {
          if (sDist + eDist > 500) continue;
          const eOccs = (eStop.arsId && this.pointsByArs.get(eStop.arsId)) || this.pointsByName.get(eStop.name) || [];
          if (eOccs.length === 0) continue;

          const totalDist = sDist + eDist;
          const nearbyBothDirect = this._findDirectPaths(sOccs, eOccs, totalDist, targetEndPoint, targetStartPoint, sDist, eDist);
          for (const p of nearbyBothDirect) {
            const rName = p.legs[0].route.name;
            if (!seenDirectRoutes.has(rName)) {
              seenDirectRoutes.add(rName);
              paths.push(p);
            }
          }
        }
      }

      // 5. One-Transfer Paths (1 Transfer)
      const transferPaths = this._findTransferPaths(startOccurrences, endOccurrences);
      paths.push(...transferPaths);

      // Sort paths:
      // Direct (0-transfer, whether exact 0m or short walk) strictly prioritized over transfers!
      paths.sort((a, b) => {
        if (sortBy === 'stops') {
          if (a.transfers !== b.transfers) return a.transfers - b.transfers;
          if (a.totalStops !== b.totalStops) return a.totalStops - b.totalStops;
          return a.walkDistance - b.walkDistance;
        } else {
          // Direct First (transfers: 0 -> 1)
          if (a.transfers !== b.transfers) return a.transfers - b.transfers;
          // For direct: fewer stops first if walk distance is comparable (<= 350m)
          if (a.transfers === 0) {
            if (a.walkDistance !== b.walkDistance) return a.walkDistance - b.walkDistance;
            return a.totalStops - b.totalStops;
          }
          // For transfer: fewer stops first, then walk distance
          if (a.totalStops !== b.totalStops) return a.totalStops - b.totalStops;
          return a.walkDistance - b.walkDistance;
        }
      });

      return paths.slice(0, maxResults);
    }

    /**
     * 1. Direct Routes (0 Transfers, with optional short walk to departure and/or destination)
     */
    _findDirectPaths(startOccurrences, endOccurrences, walkDistance = 0, walkToStop = null, walkFromStop = null, walkFromDistance = 0, walkToDistance = 0) {
      const results = [];
      const seenRoutes = new Set();

      for (const sOcc of startOccurrences) {
        for (const eOcc of endOccurrences) {
          if (!this.isValidTransitLeg(sOcc, eOcc)) continue;

          const route = sOcc.route;
          const routeName = route.routeName;

          if (seenRoutes.has(routeName)) continue;
          seenRoutes.add(routeName);

          const subPoints = route.points.slice(sOcc.pointIndex, eOcc.pointIndex + 1);
          const passengerStops = subPoints.filter(p => !isIntersection(p));

          results.push({
            type: 'direct',
            transfers: 0,
            totalStops: passengerStops.length - 1, // Number of stops moved
            walkDistance: walkDistance,
            walkToStop: walkToStop,
            walkFromStop: walkFromStop,
            walkFromDistance: walkFromDistance,
            walkToDistance: walkToDistance,
            isDirectWalk: walkDistance > 0,
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

      return results;
    }

    /**
     * 2. One-Transfer Routes (1 Transfer)
     */
    _findTransferPaths(startOccurrences, endOccurrences) {
      const results = [];
      const bestPairMap = new Map(); // key: `${route1}-${route2}` -> best path

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

          // Check downstream stops of Route 1 from sIdx + 1
          for (let i = sIdx + 1; i < r1Points.length; i++) {
            const p1 = r1Points[i];
            if (isIntersection(p1)) continue;

            const tOcc1 = {
              routeName: route1.routeName,
              route: route1,
              pointIndex: i,
              point: p1
            };

            // Leg 1 must be a valid transit leg (no terminus arrival, no cross-direction)
            if (!this.isValidTransitLeg(sOcc, tOcc1)) continue;

            // Check upstream stops of Route 2 prior to eIdx
            for (let j = 0; j < eIdx; j++) {
              const p2 = r2Points[j];
              if (isIntersection(p2)) continue;

              const tOcc2 = {
                routeName: route2.routeName,
                route: route2,
                pointIndex: j,
                point: p2
              };

              // Leg 2 must be a valid transit leg (no terminus arrival, no cross-direction)
              if (!this.isValidTransitLeg(tOcc2, eOcc)) continue;

              let isTransfer = false;
              let walkDist = 0;

              // Case A: Identical ARS ID (Same platform transfer)
              if (p1.arsId && p2.arsId && String(p1.arsId).trim() === String(p2.arsId).trim()) {
                isTransfer = true;
                walkDist = haversineMeters(p1.lat, p1.lng, p2.lat, p2.lng);
              }
              // Case B: Identical stop name (Same station transfer)
              else if (p1.name.trim() === p2.name.trim()) {
                isTransfer = true;
                walkDist = haversineMeters(p1.lat, p1.lng, p2.lat, p2.lng);
              } 
              // Case C: Nearby stop (Walking transfer within 300 meters)
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

                const r1Stops = r1Sub.filter(p => !isIntersection(p));
                const r2Stops = r2Sub.filter(p => !isIntersection(p));

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
