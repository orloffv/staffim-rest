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

            function buildPath (prefix, key) {
                var path = '/' + prefix;
                path = path.replace(/\./g, '/');

                if (_.isNumber(key) && _.isFinite(key)) {
                    key = key.toString();
                }

                if (key) {
                    path += '/' + key;
                }

                return path;
            }

            function isRealObject(obj) {
                return Object.prototype.toString.call(obj) === '[object Object]';
            }

            patch.prototype = {
                add: function(prefix, key, value) {
                    this.changes.push({
                        op: 'add',
                        path: buildPath(prefix, key),
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
                        value: value ? value : key
                    });
                },
                move: function(from, path) {
                    this.changes.push({
                        op: 'move',
                        from: buildPath(from),
                        path: buildPath(path)
                    });
                },
                copy: function(from, path) {
                    this.changes.push({
                        op: 'copy',
                        from: buildPath(from),
                        path: buildPath(path)
                    });
                },
                similar: function(prefix, key, value) {},
                getChanges: function() {
                    return this.changes;
                },
                getType: function(original, current) {
                    if (!original && current) {
                        return 'add';
                    } else if (original && !current) {
                        return 'remove';
                    } else if (_.isEqual(original, current)) {
                        return 'similar';
                    } else if (original && current) {
                        return 'replace';
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
                            this[this.getType(originalData, currentData)](currentPath, null, currentData);
                        }
                    }, this);
                }
            };

            return patch;
        });
})();
