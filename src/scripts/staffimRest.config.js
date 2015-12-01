'use strict';
(function() {
    angular.module('staffimRest')
        .config(restmod);

    restmod.$inject = ['restmodProvider'];
    function restmod(restmodProvider) {
        restmodProvider.rebase('SRApi');
    }
})();
