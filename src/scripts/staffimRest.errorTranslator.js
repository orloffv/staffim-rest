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
                var that = this;
                var errors = [];
                if (response) {
                    if ((response.status === 422 || response.status === 400) && _.isObject(response.data)) {
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
