'use strict';
(function() {
    angular.module('staffimRest')
        .service('SRErrorTranslator', SRErrorTranslator);

    SRErrorTranslator.$inject = ['SRTranslatorMap', 'SULogger'];
    function SRErrorTranslator(translatorMap, SULogger) {
        var ErrorTranslator = function(modelName) {
            var map = translatorMap(modelName);
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

                if (message) {
                    return message;
                }

                SULogger.info('SRErrorTranslator: not found translate', {
                    modelName: modelName,
                    field: field,
                    error: error
                });

                return _.capitalize(field) + ': ' + (_.isObject(error) ? error.message : error);
            };

            this.translate = function(error) {
                var message;

                if (_.isObject(error) && _.has(error, 'message')) {
                    if (!_.isUndefined(map[error.message])) {
                        message = map[error.message](error.attributes);
                    }
                }

                if (message) {
                    return message;
                }

                SULogger.info('SRErrorTranslator: not found translate', {
                    modelName: modelName,
                    error: error
                });

                return _.isObject(error) && _.has(error, 'message') ? error.message : error;
            };

            this.parseResponse = function(response) {
                var errors = [];
                if (response) {
                    if (_.contains([422, 400, 417, 403], response.status) && _.isObject(response.data)) {
                        if (_.isArray(response.data.errors)) {
                            errors = _.chain(response.data.errors)
                                .flatten()
                                .map(function(error) {
                                    return this.translate(error);
                                }, this)
                                .value();
                        } else if (_.isObject(response.data.errors)) {
                            errors = _.chain(response.data.errors)
                                .map(function(errors, field) {
                                    return _.map(errors, function(error) {
                                        return this.translateByField(field, error);
                                    }, this);
                                }, this)
                                .flatten()
                                .value();
                        } else if (_.has(response.data, 'message')) {
                            errors = [this.translate(response.data)];
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
