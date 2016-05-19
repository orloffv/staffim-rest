'use strict';
(function() {
    angular.module('staffimRest')
        .value('srDefaults', {
            patch: {
                ignoreKeys: ['_embedded']
            }
        });
}());
