#/bin/bash

browserify -r graphlib -s Graph -o ../web-content/libs/graphlib-bundle.js
browserify -r underscore -s _ -o ../web-content/libs/underscore-bundle.js
browserify -r url -s Url -o ../web-content/libs/url-bundle.js

