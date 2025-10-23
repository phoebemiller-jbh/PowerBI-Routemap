import { copy } from '../type';
import { ILocation } from './converter';
import { Func, StringMap, keys } from '../type';
import { jsonp } from './jsonp';


var _injected = {} as StringMap<ILocation>;

export function inject(locs: StringMap<ILocation>, reset = false): void {
    locs = locs || {};
    if (reset) {
        _injected = locs;
        return;
    }
    for (var key of keys(locs)) {
        var loc = locs[key];
        if (loc) {
            _injected[key] = loc;
        }
        else {
            delete _injected[key];
        }
    }
}

export function remove(where: Func<ILocation, boolean>): void {
    for (var key of keys(_injected)) {
        if (where(_injected[key])) {
            delete _injected[key];
        }
    }
}

export function latitude(addr: string): number {
    var loc = query(addr);
    if (loc) {
        return loc.latitude;
    }
    else {
        return null;
    }
}

export function longitude(addr: string): number{
    var loc = query(addr);
    if (loc) {
        return loc.longitude;
    }
    else {
        return null;
    }
}

export function query(addr: string): ILocation;
export function query(addr: string, then: Func<ILocation, void>): void;
export function query(addr: string, then?: Func<ILocation, void>): any {
    if (then) {
        var loc = _injected[addr];
        if (loc) {
            loc.address = addr;
            then(loc);
        }
        else if (addr in _initCache) {
            loc = _initCache[addr];
            loc.address = addr;
            then(loc);
        }
        else {
            geocodeCore(new GeocodeQuery(addr), then);
        }
        return undefined;
    }
    else {
        if (_injected[addr]) {
            return _injected[addr];
        }
        else if (_initCache[addr]) {
            return _initCache[addr];
        }
        var rec = geocodeCache[addr.toLowerCase()];
        if (rec) {
            rec.query.incrementCacheHit();
            return rec.coordinate;
        }
        return null;
    }
}

var _initCache = {} as StringMap<ILocation>;
export function initCache(locs: StringMap<ILocation>) {
    _initCache = copy(locs);
}


export var settings = {
    // Maximum concurrent Azure Maps requests
    MaxAzureRequest: 6,

    // Cache sizing
    MaxCacheSize: 3000,
    MaxCacheSizeOverflow: 1000,

    // Azure Maps credentials & URLs
    AzureMapsKey: "b1fb1d8a-bb38-44ad-9cd9-37506a42f859",
    AzureMapsSearchUrl: "https://atlas.microsoft.com/search/address/json",
    AzureMapsApiVersion: "1.0",
};


//private
    interface IGeocodeQuery {
        query: string;
        longitude?: number;
        latitude?: number;
    }

    interface IGeocodeCache {
        query: GeocodeQuery;
        coordinate: ILocation;
    }

    interface IGeocodeQueueItem {
        query: GeocodeQuery;
        then: (v: ILocation) => void;
    }

    var geocodeCache: { [key: string]: IGeocodeCache; };
    var geocodeQueue: IGeocodeQueueItem[];
    var activeRequests;

    class GeocodeQuery implements IGeocodeQuery {
        public query      : string;
        public key        : string;
        private _cacheHits: number;
        
        constructor(query: string = "") {
            this.query      = query;
            this.key        = this.query.toLowerCase();
            this._cacheHits = 0;
        }

        public incrementCacheHit(): void {
            this._cacheHits++;
        }

        public getCacheHits(): number {
            return this._cacheHits;
        }

        public getAzureUrl(): string {
            const u = new URL(settings.AzureMapsSearchUrl);
            u.searchParams.set("api-version", settings.AzureMapsApiVersion);
            u.searchParams.set("subscription-key", settings.AzureMapsKey);

            // Azure Maps uses a single 'query' parameter for addresses/postal codes
            // Preserve your numeric-vs-freeform handling by still passing as query.
            u.searchParams.set("query", this.query);

            //Local
            const cultureName = (navigator as any)['userLanguage'] || navigator.language;
            if (cultureName) {
                u.searchParams.set("language", cultureName);
            }

            // Results limit
            u.searchParams.set("limit", "20");
            return u.toString();
        }
    }

    function findInCache(query: GeocodeQuery): ILocation {
        var pair = geocodeCache[query.key];
        if (pair) {
            pair.query.incrementCacheHit();
            return pair.coordinate;
        }
        return undefined;
    }

    function cacheQuery(query: GeocodeQuery, coordinate: ILocation): void {
        var keys = Object.keys(geocodeCache);
        var cacheSize = keys.length;

        if (Object.keys(geocodeCache).length > (settings.MaxCacheSize + settings.MaxCacheSizeOverflow)) {

            var sorted = keys.sort((a: string, b: string) => {                
                var ca = geocodeCache[a].query.getCacheHits();
                var cb = geocodeCache[b].query.getCacheHits();
                return ca < cb ? -1 : (ca > cb ? 1 : 0);
            });

            for (var i = 0; i < (cacheSize - settings.MaxCacheSize); i++) {
                delete geocodeCache[sorted[i]];
            }
        }

        geocodeCache[query.key] = { query: query, coordinate: coordinate };
    }

    function geocodeCore(geocodeQuery: GeocodeQuery, then: (v: ILocation) => void): void {
        var result = findInCache(geocodeQuery);
        if (result) {
            result.address = geocodeQuery.query;
            then(result);
        } else {
            geocodeQueue.push({ query: geocodeQuery, then: then });
            releaseQuota();
        }
    }

    // export function batch(queries: string[])

    export function getCacheSize(): number {
        return Object.keys(geocodeCache).length;
    }

    function releaseQuota(decrement: number = 0) {
        activeRequests -= decrement;
        while (activeRequests < settings.MaxAzureRequest) {
            if (geocodeQueue.length === 0) break;
            activeRequests++;
            makeRequest(geocodeQueue.shift()!);
        }
    }

    // var debugCache: { [key: string]: ILocation };
    function makeRequest(item: IGeocodeQueueItem) {
        // Check again if we already got the coordinate;
        const cached = findInCache(item.query);
        if (cached) {
            cached.address = item.query.query;
            setTimeout(() => releaseQuota(1));
            item.then(cached);
            return;
        }

        // if (!debugCache) {
        //     debugCache = {};
        //     // let coords = debugData.locs;
        //     // let names = debugData.names;
        //     for (let i = 0; i < names.length; i++) {
        //         let key = names[i].toLowerCase();
        //         debugCache[key] = {
        //             latitude: coords[i * 2],
        //             longitude: coords[i * 2 + 1],
        //             type: 'test',
        //             name: item.query.query
        //         };
        //     }
        // }
        // if (debugCache[item.query.key]) {
        //     setTimeout(() => {
        //         completeRequest(item, null, debugCache[item.query.key]);
        //     }, 80);
        //     return;
        // }

        // Unfortunately the Bing service doesn't support CORS, only jsonp. 
        // This issue must be raised and revised.
        // VSTS: 1396088 - Tracking: Ask: Bing geocoding to support CORS
        const url = item.query.getAzureUrl();

        fetch(url, {
            method: "GET",
            // You can add headers if needed - Azure accepts params; CORS is enabled.
            // headers: { "Accept-Language": cultureName ) // optional
        })
        .then(res => {
            if (!res.ok) {
                throw new Error('Azure Maps HTTP ${res.status}');
            }
            return res.json();
        })
        .then(data => {
            // Expected shape: { results: [ {position: { Lat, Lon }, address: { freeformAddress }, type, poi? } ] }
            if (!data || !Array.isArray(data.results) || data.results.length < 1) {
                completeRequest(item, ERROR_EMPTY, null);
                return;
            }

            const index = getBestResultIndexAzure(data.results, item.query);
            const best = data.results[index];

            const lat = +best.position.lat;
            const lon = +best.position.lon;

            const displayName = 
                (best.poi && best.poi.name) ||
                (best.address && best.address.freeformAddress) ||
                item.query.query;

            const coord: ILocation = {
                latitude: lat,
                longitude: lon,
                type: best.type || "Geography",
                name: displayName,
                address: item.query.query, // set below too for consistency
            };

            completeRequest(item, null as any, coord);
        })
        .catch(err => {
            // Consider logging err for diagnostics
            completeRequest(item, err, null);
        });
    }

    var ERROR_EMPTY = new Error("Geocode result is empty.");
    var dequeueTimeoutId;

    function completeRequest(item: IGeocodeQueueItem, error: Error, coordinate: ILocation = null) {
        dequeueTimeoutId = setTimeout(() => releaseQuota(1), 0);
        if (error) {
            item.then(undefined);
        }
        else {
            cacheQuery(item.query, coordinate);
            coordinate.address = item.query.query;
            item.then(coordinate);
        }
    }

    function getBestResultIndex(resources: any[], query: GeocodeQuery) {
        return 0;
    }

    function reset(): void {
        geocodeCache = {};
        geocodeQueue = [];
        activeRequests = 0;
        clearTimeout(dequeueTimeoutId);
        dequeueTimeoutId = null;
    }

    function captureMapsErrors() {
        try {
            const lastError: OnErrorEventHandler = window.onerror || (() => {});  
            window.onerror = (msg: any, url: string, line: number, column?: number, error?: any) => {
                // if you want to suppress only Azure Maps scrip errors (not typical with fetch), you could check 'atlas.microsoft.com' here. Usually unnecessary.
                return lastError ? lastError(msg, url, line, column, error) : false;
            };
        } catch (error) {
            console.log(error);
        }
    }

    function reset(): void {
        geocodeCache = {};
        geocodeQueue = [];
        activeRequests = 0;
        clearTimeout(dequeueTimeoutId);
        dequeueTimeoutId = null as any;
    }

    reset();
    captureMapsErrors();
