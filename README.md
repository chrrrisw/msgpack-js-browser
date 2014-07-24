# msgpack for the browser

[![Build Status](https://secure.travis-ci.org/creationix/msgpack-js-browser.png)](http://travis-ci.org/creationix/msgpack-js-browser)

A handwritten msgpack encoder and decoder for Browsers

This is a browser port of https://github.com/creationix/msgpack-js

This version now attempts to support the latest specification.

- 'undefined' is now handled as nil (removing parent project functionality).
- ArrayBuffers are now handled as bin8/bin16/bin32 (parent project implements them as 0xd8/0xd9 which clash with fixext16 and str8 in new spec)
- Ext family is decoded as an object with a 'type' and 'data' attribute. They cannot currently be encoded.
- Strings now use fixstr/str8/str16/str32
- 64-bit ints are not handled.

The latest spec can be found at <https://github.com/msgpack/msgpack>

## Usage

``` javascript
require(['msgpack'], function (msgpack) {

  var initial = {Hello: "World"};
  var encoded = msgpack.encode(initial);
  var decoded = msgpack.decode(encoded);

});
```

