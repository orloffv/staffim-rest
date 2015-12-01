module.exports = function(grunt) {
    "use strict";

    grunt.initConfig({
        concat: {
            js: {
                src: [
                    'src/scripts/staffimRest.module.js',
                    'src/scripts/staffimRest.patch.js',
                    'src/scripts/staffimRest.restmod.js',
                    'src/scripts/staffimRest.config.js'
                ],
                dest: './dist/staffim-rest.js'
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-concat');

    grunt.registerTask('dist', ['concat']);
};
