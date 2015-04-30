#/bin/bash

browserify -r url -s Url -o ../web-content/url-bundle.js
browserify -r underscore -s _ -o ../web-content/underscore-bundle.js

