'use strict';
(function() {
    angular.module('staffimRest')
        .constant('LIMIT_INFINITY', 0)
        .factory('nullableFilter',  nullableFilter)
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

    function nullableFilter() {
        return function(value) {
            return _.isEmpty(value) ? null : value;
        };
    }

    SRPacker.$inject = ['restmod', 'SRPatch', 'RMUtils', 'LIMIT_INFINITY', '$q', 'SUNotify', 'SULogger'];
    function SRPacker(restmod, Patch, Utils, LIMIT_INFINITY, $q, SUNotify, SULogger) {
        return restmod.mixin(function() {
            this
                .on('before-render', function(data) {
                    delete data._embedded;
                })
                .on('after-feed', function() {
                    this.$patchOriginal = this.$getData();
                })
                .on('before-fetch', function(request) {
                    this.$patchRequestParams = angular.copy(request.params);
                })
                .on('before-fetch-many', function(request) {
                    this.$patchRequestParams = angular.copy(request.params);
                    this.$lastRequest = request;
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
                .on('after-request-error', function(errorResponse) {
                    if (errorResponse.status !== 404) {
                        SULogger.info('SRRestmod: error response', {
                            response: JSON.stringify(errorResponse.data),
                            status: errorResponse.status,
                            requestData: JSON.stringify(errorResponse.config.data),
                            method: errorResponse.config.method,
                            requestParams: JSON.stringify(errorResponse.config.params),
                            url: errorResponse.config.url
                        });
                    }
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
                        offset: 0,
                        limit: LIMIT_INFINITY,
                        q: queryParams
                    };

                    return this.$search(_.deepExtend({}, this.$params, queryParams, params));
                })
                .define('Scope.getDownloadUrl', function(extension) {
                    if (this.$lastRequest) {
                        return this.$lastRequest.url + '.' + extension + '?' + $.param(this.$lastRequest.params);
                    }

                    return null;
                })
                .define('Scope.$fetchLimit', function(queryParams, limit, params) {
                    params = params || {};
                    limit = _.isUndefined(limit) ? 10 : limit;
                    queryParams = {
                        limit: limit,
                        q: queryParams
                    };

                    return this.$search(_.deepExtend({}, this.$params, queryParams, params));
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
                        }, {})
                        .value();

                    var queryParams = {
                        'sort_by': sortBy,
                        limit: tableParams.count(),
                        offset: tableParams.count() * (tableParams.page() - 1),
                        q: tableParams.filter()
                    };

                    return this
                        .$search(_.deepExtend({}, queryParams, params))
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
                .define('Scope.$withSTParams', function(tableParams, params) {
                    params = params || {};
                    if (_.isUndefined(tableParams.isFirstLoad)) {
                        params = _.extend({}, this.$params, params);
                        tableParams.isFirstLoad = true;
                    }

                    var sortBy = _.chain(tableParams.orderBy())
                        .words(',')
                        .reduce(function(memo, orderBy) {
                            memo[_.trim(orderBy, '+-')] = (_.startsWith(orderBy, '+') || _.startsWith(orderBy, '-')) ? (_.startsWith(orderBy, '+') ?
                                'asc' : 'desc') :
                                (_.startsWith(tableParams.orderBy(), '+') ? 'asc' : 'desc');

                            return memo;
                        }, {})
                        .value();

                    var queryParams = {
                        'sort_by': sortBy,
                        limit: tableParams.count(),
                        offset: tableParams.count() * (tableParams.page() - 1),
                        q: tableParams.filterFormatter()
                    };

                    return this
                        .$search(_.deepExtend({}, queryParams, params))
                        .$then(function(data) {
                            if (tableParams.isFirstLoad === true) {
                                tableParams.settings({
                                    getData: function($defer, tableParams) {
                                        data.$withSTParams(tableParams, params)
                                            .$then(function(data) {
                                                tableParams.settings({
                                                    total: data.$metadata.count
                                                });

                                                $defer.resolve(data);
                                            });
                                    },
                                    dataset: data,
                                    total: data.$metadata.count
                                });
                                tableParams.isFirstLoad = false;
                            }

                            return data;
                        });
                })
                .define('Record.$patchModel', function(data, options) {
                    options = _.extend({
                        errorMessage: 'Не удалось сохранить',
                        successMessage: 'Успешно сохранено'
                    }, options || {});

                    var original = this;
                    var patchedModel = _.copyModel(original);
                    var defer = $q.defer();
                    _.deepExtend(patchedModel, data);
                    patchedModel
                        .$patch(_.keys(data))
                        .$asPromise()
                        .then(function(data) {
                            _.copyModel(patchedModel, original);
                            if (options.successMessage) {
                                SUNotify.success(options.successMessage);
                            }
                            defer.resolve(data);
                        })
                        .catch(function(errorResponse) {
                            SUNotify.errorResponse(errorResponse, options.errorMessage);
                            defer.reject(errorResponse);
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
                                return this.$save();
                            });
                        }
                    };
                })
                .define('Record.$getData', function() {
                    return this.$wrap(Utils.UPDATE_MASK);
                })
                .define('Record.$patch', function(paths, patchAction, requestParams) {
                    var that = this;
                    if (!this.$patchOriginal) {
                        return this.$withParams(requestParams).$save();
                    }

                    return this.$action(function() {
                        var patch = new Patch();
                        if (_.size(paths)) {
                            var currentData = this.$getData();
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
