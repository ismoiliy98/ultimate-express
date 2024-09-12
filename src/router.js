import { patternToRegex, needsConversionToRegex } from "./utils.js";

let routeKey = 0;

const methods = [
    'all',
    'post', 'put', 'delete', 'patch', 'options', 'head', 'trace', 'connect',
    'checkout', 'copy', 'lock', 'mkcol', 'move', 'purge', 'propfind', 'proppatch',
    'search', 'subscribe', 'unsubscribe', 'report', 'mkactivity', 'mkcalendar',
    'checkout', 'merge', 'm-search', 'notify', 'subscribe', 'unsubscribe', 'search'
];

export default class Router {
    #routes = [];
    #paramCallbacks = new Map();
    #mountpathCache = new Map();
    constructor() {
        this.errorRoute = undefined;
        this.mountpath = '/';

        for(let method of methods) {
            this[method] = (path, ...callbacks) => {
                this.#createRoute(method.toUpperCase(), path, this, ...callbacks);
            };
        };
    }

    get(path, ...callbacks) {
        return this.#createRoute('GET', path, this, ...callbacks);
    }

    #getFullMountpath(req) {
        let fullStack = req._stack.join("");
        let fullMountpath = this.#mountpathCache.get(fullStack);
        if(!fullMountpath) {
            fullMountpath = patternToRegex(fullStack, true);
            this.#mountpathCache.set(fullStack, fullMountpath);
        }
        return fullMountpath;
    }

    #pathMatches(route, req) {
        const path = req._opPath;
        const pattern = route.pattern;
        
        if (typeof pattern === 'string') {
            return pattern === path || pattern === '*' || pattern === '/*';
        }
        
        return pattern.test(path);
    }

    #createRoute(method, path, parent = this, ...callbacks) {
        callbacks = callbacks.flat();
        let routeSkipKey = routeKey + callbacks.length - 1;
        for(let callback of callbacks) {
            const paths = Array.isArray(path) ? path : [path];
            const routes = [];
            for(let path of paths) {
                if(typeof path === 'string' && path.endsWith('/') && path !== '/') {
                    path = path.slice(0, -1);
                }
                const route = {
                    method: method === 'USE' ? 'ALL' : method.toUpperCase(),
                    path,
                    pattern: method === 'USE' || needsConversionToRegex(path) ? patternToRegex(path, method === 'USE') : path,
                    callback,
                    routeSkipKey,
                    routeKey: routeKey++,
                    use: method === 'USE',
                    all: method === 'ALL' || method === 'USE',
                };
                routes.push(route);
            }
            this.#routes.push(...routes);
        }

        return parent;
    }

    #extractParams(pattern, path) {
        let match = pattern.exec(path);
        return match?.groups ?? {};
    }

    async #preprocessRequest(req, res, route) {
        req.route = route;
        if(typeof route.path === 'string' && route.path.includes(':') && route.pattern instanceof RegExp) {
            let path = req.path;
            if(req._stack.length > 0) {
                path = path.replace(this.#getFullMountpath(req), '');
            }
            req.params = this.#extractParams(route.pattern, path);

            for(let param in req.params) {
                if(this.#paramCallbacks.has(param) && !req._gotParams.has(param)) {
                    req._gotParams.add(param);
                    for(let fn of this.#paramCallbacks.get(param)) {
                        await new Promise(resolve => fn(req, res, resolve, req.params[param], param));
                    }
                }
            }
        } else {
            req.params = {};
        }

        return true;
    }

    param(name, fn) {
        let names = Array.isArray(name) ? name : [name];
        for(let name of names) {
            if(!this.#paramCallbacks.has(name)) {
                this.#paramCallbacks.set(name, []);
            }
            this.#paramCallbacks.get(name).push(fn);
        }
    }

    async _routeRequest(req, res, i = 0) {
        return new Promise(async (resolve) => {
            while (i < this.#routes.length) {
                if(res.aborted) {
                    resolve(false);
                    return;
                }
                const route = this.#routes[i];
                if ((route.all || route.method === req.method) && this.#pathMatches(route, req)) {
                    let calledNext = false, dontStop = false;
                    await this.#preprocessRequest(req, res, route);
                    if(route.callback instanceof Router) {
                        req._stack.push(route.path);
                        req._opPath = req.path.replace(this.#getFullMountpath(req), '');
                        req.url = req._opPath + req.urlQuery;

                        if(await route.callback._routeRequest(req, res, 0)) {
                            resolve(true);
                        } else {
                            req._stack.pop();
                            req._opPath = req._stack.length > 0 ? req.path.replace(this.#getFullMountpath(req), '') : req.path;
                            req.url = req._opPath + req.urlQuery;
                            dontStop = true;
                        }
                    } else {
                        try {
                            await route.callback(req, res, thingamabob => {
                                calledNext = true;
                                if(thingamabob) {
                                    if(thingamabob === 'route') {
                                        let routeSkipKey = route.routeSkipKey;
                                        while(this.#routes[i].routeKey !== routeSkipKey && i < this.#routes.length) {
                                            i++;
                                        }
                                    } else {
                                        throw thingamabob;
                                    }
                                }
                                dontStop = true;
                            });
                        } catch(err) {
                            if(this.errorRoute) {
                                await this.errorRoute(err, req, res, () => {
                                    resolve(res.sent);
                                });
                                return resolve(true);
                            } else {
                                console.error(err);
                                // TODO: support env setting
                                res.status(500).send(this._generateErrorPage('Internal Server Error'));
                            }
                        }
                    }
                    if(!calledNext) {
                        resolve(true);
                    }
                    if(!dontStop) {
                        return;
                    }
                }
                i++;
            }
            resolve(false);
        });
    }
    use(path, ...callbacks) {
        if(typeof path === 'function' || path instanceof Router || (Array.isArray(path) && path.every(p => typeof p === 'function' || p instanceof Router))) {
            if(callbacks.length === 0 && typeof path === 'function' && path.length === 4) {
                this.errorRoute = path;
                return;
            }
            callbacks.unshift(path);
            path = '';
        }
        if(path === '/') {
            path = '';
        }
        for(let callback of callbacks) {
            if(callback instanceof Router) {
                callback.mountpath = path;
                callback.parent = this;
            }
        }
        this.#createRoute('USE', path, this, ...callbacks);
    }
    
    route(path) {
        let fns = {};
        for(let method of methods) {
            fns[method] = (...callbacks) => {
                return this.#createRoute(method.toUpperCase(), path, fns, ...callbacks);
            };
        }
        fns.get = (...callbacks) => {
            return this.#createRoute('GET', path, fns, ...callbacks);
        };
        return fns;
    }

    _generateErrorPage(err) {
        return `<!DOCTYPE html>\n` +
            `<html lang="en">\n` +
            `<head>\n` +
            `<meta charset="utf-8">\n` +
            `<title>Error</title>\n` +
            `</head>\n` +
            `<body>\n` +
            `<pre>${err}</pre>\n` +
            `</body>\n` +
            `</html>\n`;
    }
}