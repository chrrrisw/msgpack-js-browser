# msgpack for the browser

[![Build Status](https://secure.travis-ci.org/creationix/msgpack-js-browser.png)](http://travis-ci.org/creationix/msgpack-js-browser)

A handwritten msgpack encoder and decoder for Browsers

This is a browser port of https://github.com/creationix/msgpack-js

This version now supports the latest specification.

The latest spec can be found at <https://github.com/msgpack/msgpack>

## Usage

``` javascript
require(['msgpack'], function (msgpack) {

  var initial = {Hello: "World"};
  var encoded = msgpack.encode(initial);
  var decoded = msgpack.decode(encoded);

});
```

