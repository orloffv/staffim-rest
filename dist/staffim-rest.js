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
                    if (_.isUndefined(original) && !_.isUndefined(current)) {
                        return 'add';
                    } else if (!_.isUndefined(original) && _.isUndefined(current)) {
                        return 'remove';
                    } else if (_.isEqual(original, current)) {
                        return 'similar';
                    } else if (!_.isUndefined(original) && !_.isUndefined(current)) {
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
                            if (_.size(originalData) >= _.size(currentData)) {
                                this.build(_.times(maxLength, function(i) {return maxLength - 1 - i;}), originalData, currentData, currentPath);
                            } else {
                                this.build(_.times(maxLength, function(i) {return i;}), originalData, currentData, currentPath);
                            }
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
                .on('before-fetch', function(request) {
                    this.$patchRequestParams = angular.copy(request.params);
                })
                .on('before-fetch-many', function(request) {
                    this.$patchRequestParams = angular.copy(request.params);
                    if (_.has(this.$patchRequestParams, 'limit')) {
                        delete this.$patchRequestParams.limit;
                    }

                    if (_.has(this.$patchRequestParams, 'offset')) {
                        delete this.$patchRequestParams.offset;
                    }

                    if (_.has(this.$patchRequestParams, 'q')) {
                        delete this.$patchRequestParams.q;
                    }

                    if (_.has(this.$patchRequestParams, 'sort_by')) {
                        delete this.$patchRequestParams['sort_by'];
                    }
                })
                .on('after-fetch-many', function() {
                    var that = this;
                    _.each(this, function(model) {
                        model.$patchRequestParams = that.$patchRequestParams;
                    });
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
                .define('Scope.$fetchAll', function(queryParams, params) {
                    params = params || {};
                    queryParams = {
                        limit: LIMIT_INFINITY,
                        q: queryParams
                    };

                    return this.$search($.extend(true, {}, this.$params, queryParams, params));
                })
                .define('Scope.$fetchLimit', function(queryParams, limit, params) {
                    params = params || {};
                    limit = _.isUndefined(limit) ? 10 : limit;
                    queryParams = {
                        limit: limit,
                        q: queryParams
                    };

                    return this.$search($.extend(true, {}, this.$params, queryParams, params));
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
                .define('Record.$patchModel', function(data) {
                    var original = this;
                    var patchedModel = _.clone(this);
                    var defer = $q.defer();
                    patchedModel = $.extend(true, {}, patchedModel, data);
                    patchedModel
                        .$patch(_.keys(data))
                        .$asPromise()
                        .then(function(data) {
                            angular.copy(patchedModel, original);

                            defer.resolve(data);
                        })
                        .catch(function(data) {
                            defer.reject(data);
                        });

                    return defer.promise;
                })
                .define('Record.$withParams', function(params) {
                    var decorator = {
                        'before-request': function(req) {
                            req.params = params;
                        }
                    };
                    var that = this;

                    return {
                        $save: function() {
                            return that.$decorate(decorator, function() {
                                return this.$save()
                            });
                        }
                    };
                })
                .define('Record.$patch', function(paths, patchAction, requestParams) {
                    var that = this;
                    if (!this.$patchOriginal) {
                        return this.$withParams(requestParams).$save();
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
                                params: _.extend({}, that.$patchRequestParams, requestParams),
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

'use strict';
(function() {
    angular.module('staffimRest')
        .service('SRErrorTranslator', SRErrorTranslator);

    SRErrorTranslator.$inject = ['SRTranslatorsMap'];
    function SRErrorTranslator(translatorsMap) {
        var ErrorTranslator = function(modelName) {
            var map = translatorsMap.getMap(modelName);
            this.translateByField = function(field, error) {
                var message;
                if (_.isString(error)) {
                    if (!_.isUndefined(map[error])) {
                        message = map[error](field);
                    }
                } else if (_.isObject(error)) {
                    /*jshint camelcase: false */
                    if (error.message_template && !_.isUndefined(map[error.message_template])) {
                        var attributes = {};
                        _.each(error.attributes, function(value, key) {
                            attributes[key.replace('{{ ', '').replace(' }}', '')] = value;
                        });
                        message = map[error.message_template](field, attributes);
                    } else if (error.message && !_.isUndefined(map[error.message])) {
                        message = map[error.message](field);
                    }
                    /*jshint camelcase: true */
                }

                return message ? message : (_.capitalize(field) + ': ' + (_.isObject(error) ? error.message : error));
            };

            this.translate = function(error) {
                var message;

                if (_.isObject(error) && _.has(error, 'message')) {
                    if (!_.isUndefined(map[error.message])) {
                        message = map[error.message](error.attributes);
                    }
                }

                return message ? message : (_.isObject(error) && _.has(error, 'message') ? error.message : error);
            };

            this.parseResponse = function(response) {
                var that = this;
                var errors = [];
                if (response) {
                    if (response.status === 422 && _.isObject(response.data)) {
                        if (_.isArray(response.data.errors)) {
                            errors = _.chain(response.data.errors)
                                .flatten()
                                .map(function(error) {
                                    return that.translate(error);
                                })
                                .value();
                        } else if (_.isObject(response.data.errors)) {
                            errors = _.chain(response.data.errors)
                                .map(function(errors, field) {
                                    return _.map(errors, function(error) {
                                        return that.translateByField(field, error);
                                    });
                                })
                                .flatten()
                                .value();
                        }
                    } else if (_.isString(response)) {
                        errors.push(response);
                    }
                }

                return errors;
            };
        };

        return ErrorTranslator;
    }
})();
