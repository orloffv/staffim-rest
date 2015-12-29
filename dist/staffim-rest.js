(function(){
    angular.module('staffimRest', ['restmod', 'staffimUtils']);
})();

'use strict';
(function() {
    angular.module('staffimRest')
        .service('SRPatch', function() {
            var patch = function() {
                this.changes = [];
            };

            function getPath(context, key) {
                var paths = (key + '').split('.');
                var object = context[paths.shift()];

                _.each(paths, function(key) {
                    object = object[key];
                });

                return object;
            }

            function buildPath (prefix, key, lastMinus) {
                lastMinus = lastMinus || false;
                var path = '/' + prefix;
                path = path.replace(/\./g, '/');

                if (_.isNumber(key) && _.isFinite(key)) {
                    key = key.toString();
                }

                if (key) {
                    path += '/' + key;
                }

                if (lastMinus) {
                    var lastSlash = path.lastIndexOf('/');
                    if (lastSlash !== -1) {
                        var number = parseInt(path.substring(lastSlash + 1), 10);
                        if (isInt(number)) {
                            path = path.substring(0, lastSlash + 1) + '-';
                        }
                    }
                }

                return path;
            }

            function isRealObject(obj) {
                return Object.prototype.toString.call(obj) === '[object Object]';
            }

            function isInt(n) {
                return n % 1 === 0;
            }

            patch.prototype = {
                add: function(prefix, key, value) {
                    this.changes.push({
                        op: 'add',
                        path: buildPath(prefix, key, true),
                        value: value
                    });
                },
                remove: function(prefix, key, value) {
                    this.changes.push({
                        op: 'remove',
                        path: buildPath(prefix, key),
                        value: value
                    });
                },
                replace: function(prefix, key, value) {
                    this.changes.push({
                        op: 'replace',
                        path: buildPath(prefix),
                        value: !_.isUndefined(value) ? value : key
                    });
                },
                similar: function(prefix, key, value) {},
                'undefined': function(prefix, key, value) {},
                getChanges: function() {
                    return this.changes;
                },
                getType: function(original, current) {
                    if (_.isUndefined(original) && !_.isUndefined(original)) {
                        return 'add';
                    } else if (!_.isUndefined(original) && _.isUndefined(original)) {
                        return 'remove';
                    } else if (_.isEqual(original, current)) {
                        return 'similar';
                    } else if (!_.isUndefined(original) && !_.isUndefined(original)) {
                        return 'replace';
                    } else {
                        return 'undefined';
                    }
                },
                build: function(paths, original, current, parentPath, patchAction) {
                    _.each(paths, function(path) {
                        var currentPath = parentPath ? parentPath + '.' + path : path;
                        var originalData = getPath(original, path);
                        var currentData = getPath(current, path);
                        if (patchAction) {
                            this[patchAction](currentPath, null, currentData);
                        } else if (isRealObject(originalData) && isRealObject(currentData)) {
                            this.build(_.keys(_.extend({}, originalData, currentData)), originalData, currentData, currentPath);
                        } else if (_.isArray(originalData) && _.isArray(currentData)) {
                            var maxLength = Math.max(_.size(originalData), _.size(currentData));

                            this.build(_.times(maxLength, function(i) {return i;}), originalData, currentData, currentPath);
                        } else {
                            var type = this.getType(originalData, currentData);
                            this[type](currentPath, null, currentData);
                        }
                    }, this);
                }
            };

            return patch;
        });
})();

'use strict';
(function() {
    angular.module('staffimRest')
        .constant('LIMIT_INFINITY', 0)
        .factory('SRApi', SRApi)
        .factory('SRPacker', SRPacker);

    SRApi.$inject = ['restmod', 'CONFIG'];
    function SRApi(restmod, CONFIG) {
        return restmod.mixin('SRPacker', {
            $config: {
                style: 'Staffim',
                primaryKey: 'id',
                jsonMeta: '_meta',
                jsonRootMany: 'items',
                jsonRootSingle: '.',
                urlPrefix: CONFIG.apiUrl
            }
        });
    }

    SRPacker.$inject = ['restmod', 'SRPatch', 'RMUtils', 'LIMIT_INFINITY', '$q'];
    function SRPacker(restmod, Patch, Utils, LIMIT_INFINITY, $q) {
        return restmod.mixin(function() {
            this
                .on('before-render', function(data) {
                    delete data._embedded;
                })
                .on('after-feed', function() {
                    this.$patchOriginal = this.$wrap(Utils.UPDATE_MASK);
                })
                .define('Model.unpack', function(_resource, _raw) {
                    var name = null,
                        meta = this.getProperty('jsonMeta', 'meta');

                    if (_resource.$isCollection) {
                        name = this.getProperty('jsonRootMany') || this.getProperty('jsonRoot') || this.identity(true);
                    } else {
                        // TODO: use plural for single resource option.
                        name = this.getProperty('jsonRootSingle') || this.getProperty('jsonRoot') || this.identity();
                    }

                    _resource.$metadata = meta && _raw && _.has(_raw, meta) ? _raw[meta] : {};
                    if (_resource.$isCollection) {
                        if (!_.has(_resource.$metadata, 'count')) {
                            if (_.has(_raw, 'items')) {
                                _resource.$metadata.count = _.size(_raw.items);
                            }
                        }
                    }

                    return name === '.' ? _raw : _raw[name];
                })
                .define('Scope.$fetchAll', function(params) {
                    return this.$search({limit: LIMIT_INFINITY, q: params});
                })
                .define('Scope.$withNgTableParams', function(tableParams, params) {
                    params = params || {};

                    if (_.isUndefined(tableParams.isFirstLoad)) {
                        params = _.extend({}, this.$params, params);
                    }

                    if (tableParams.isFirstLoad) {
                        tableParams.isFirstLoad = false;

                        return this;
                    }

                    var sortBy = _.chain(tableParams.orderBy())
                        .words(',')
                        .reduce(function(memo, orderBy) {
                            memo[_.trim(orderBy, '+-')] = (_.startsWith(orderBy, '+') || _.startsWith(orderBy, '-')) ? (_.startsWith(orderBy, '+') ?
                                'asc' : 'desc') :
                                (_.startsWith(tableParams.orderBy(), '+') ? 'asc' : 'desc');

                            return memo;
                        }, {});

                    var queryParams = {
                        'sort_by': sortBy,
                        limit: tableParams.count(),
                        offset: tableParams.count() * (tableParams.page() - 1),
                        q: tableParams.filter()
                    };

                    return this
                        .$search($.extend(true, {}, queryParams, params))
                        .$then(function(data) {
                            if (_.isUndefined(tableParams.isFirstLoad)) {
                                tableParams.isFirstLoad = true;
                            }
                            tableParams.total(data.$metadata.count);
                            tableParams.settings({
                                getData: function($defer, tableParams) {
                                    data.$withNgTableParams(tableParams, params)
                                        .$then(function(data) {
                                            $defer.resolve(data);
                                        });
                                }
                            });

                            return data;
                        });
                })
                .define('Record.$patch', function(paths, patchAction) {
                    var that = this;
                    if (!this.$patchOriginal) {
                        return this.$save();
                    }

                    return this.$action(function() {
                        var patch = new Patch();
                        if (_.size(paths)) {
                            var currentData = this.$wrap(Utils.UPDATE_MASK);
                            patch.build(paths, that.$patchOriginal, currentData, undefined, patchAction);
                        }
                        if (!_.size(patch.getChanges())) {
                            var defer = $q.defer();
                            defer.resolve(that);

                            return defer.promise;
                        }
                        var url = this.$url('update'),
                            request = {
                                method: this.$type.getProperty('patchMethod', 'PATCH'), // allow user to override patch method
                                url: url,
                                data: patch.getChanges()
                            };
                        this
                            .$dispatch('before-update', [request, true])
                            .$dispatch('before-save', [request])
                            .$send(request, function(_response) {
                                if (_response.data) {
                                    this.$unwrap(_response.data);
                                }

                                this
                                    .$dispatch('after-update', [_response, true])
                                    .$dispatch('after-save', [_response]);
                            }, function(_response) {
                                this
                                    .$dispatch('after-update-error', [_response, true])
                                    .$dispatch('after-save-error', [_response]);
                            });
                    });
                });
        });
    }
})();

'use strict';
(function() {
    angular.module('staffimRest')
        .config(restmod);

    restmod.$inject = ['restmodProvider'];
    function restmod(restmodProvider) {
        restmodProvider.rebase('SRApi');
    }
})();
