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
