( // Module boilerplate to support browser globals and browserify and AMD.
  typeof define === "function" ? function (m) { define("msgpack-js", m); } :
  typeof exports === "object" ? function (m) { module.exports = m(); } :
  function(m){ this.msgpack = m(); }
)(function () {
"use strict";

var exports = {};

exports.inspect = inspect;
function inspect(buffer) {
  if (buffer === undefined) return "undefined";
  var view;
  var type;
  if (buffer instanceof ArrayBuffer) {
    type = "ArrayBuffer";
    view = new DataView(buffer);
  }
  else if (buffer instanceof DataView) {
    type = "DataView";
    view = buffer;
  }
  if (!view) return JSON.stringify(buffer);
  var bytes = [];
  for (var i = 0; i < buffer.byteLength; i++) {
    if (i > 20) {
      bytes.push("...");
      break;
    }
    var byte = view.getUint8(i).toString(16);
    if (byte.length === 1) byte = "0" + byte;
    bytes.push(byte);
  }
  return "<" + type + " " + bytes.join(" ") + ">";
}

// Encode string as utf8 into dataview at offset
exports.utf8Write = utf8Write;
function utf8Write(view, offset, string) {
  var byteLength = view.byteLength;
  for(var i = 0, l = string.length; i < l; i++) {
    var codePoint = string.charCodeAt(i);

    // One byte of UTF-8
    if (codePoint < 0x80) {
      view.setUint8(offset++, codePoint >>> 0 & 0x7f | 0x00);
      continue;
    }

    // Two bytes of UTF-8
    if (codePoint < 0x800) {
      view.setUint8(offset++, codePoint >>> 6 & 0x1f | 0xc0);
      view.setUint8(offset++, codePoint >>> 0 & 0x3f | 0x80);
      continue;
    }

    // Three bytes of UTF-8.  
    if (codePoint < 0x10000) {
      view.setUint8(offset++, codePoint >>> 12 & 0x0f | 0xe0);
      view.setUint8(offset++, codePoint >>> 6  & 0x3f | 0x80);
      view.setUint8(offset++, codePoint >>> 0  & 0x3f | 0x80);
      continue;
    }

    // Four bytes of UTF-8
    if (codePoint < 0x110000) {
      view.setUint8(offset++, codePoint >>> 18 & 0x07 | 0xf0);
      view.setUint8(offset++, codePoint >>> 12 & 0x3f | 0x80);
      view.setUint8(offset++, codePoint >>> 6  & 0x3f | 0x80);
      view.setUint8(offset++, codePoint >>> 0  & 0x3f | 0x80);
      continue;
    }
    throw new Error("bad codepoint " + codePoint);
  }
}

exports.utf8Read = utf8Read;
function utf8Read(view, offset, length) {
  var string = "";
  for (var i = offset, end = offset + length; i < end; i++) {
    var byte = view.getUint8(i);
    // One byte character
    if ((byte & 0x80) === 0x00) {
      string += String.fromCharCode(byte);
      continue;
    }
    // Two byte character
    if ((byte & 0xe0) === 0xc0) {
      string += String.fromCharCode(
        ((byte & 0x0f) << 6) | 
        (view.getUint8(++i) & 0x3f)
      );
      continue;
    }
    // Three byte character
    if ((byte & 0xf0) === 0xe0) {
      string += String.fromCharCode(
        ((byte & 0x0f) << 12) |
        ((view.getUint8(++i) & 0x3f) << 6) |
        ((view.getUint8(++i) & 0x3f) << 0)
      );
      continue;
    }
    // Four byte character
    if ((byte & 0xf8) === 0xf0) {
      string += String.fromCharCode(
        ((byte & 0x07) << 18) |
        ((view.getUint8(++i) & 0x3f) << 12) |
        ((view.getUint8(++i) & 0x3f) << 6) |
        ((view.getUint8(++i) & 0x3f) << 0)
      );
      continue;
    }
    throw new Error("Invalid byte " + byte.toString(16));
  }
  return string;
}

exports.utf8ByteCount = utf8ByteCount;
function utf8ByteCount(string) {
  var count = 0;
  for(var i = 0, l = string.length; i < l; i++) {
    var codePoint = string.charCodeAt(i);
    if (codePoint < 0x80) {
      count += 1;
      continue;
    }
    if (codePoint < 0x800) {
      count += 2;
      continue;
    }
    if (codePoint < 0x10000) {
      count += 3;
      continue;
    }
    if (codePoint < 0x110000) {
      count += 4;
      continue;
    }
    throw new Error("bad codepoint " + codePoint);
  }
  return count;
}

exports.encode = function (value) {
  var buffer = new ArrayBuffer(sizeof(value));
  var view = new DataView(buffer);
  encode(value, view, 0);
  return buffer;
};

exports.decode = decode;

// http://wiki.msgpack.org/display/MSGPACK/Format+specification

function Decoder(view, offset) {
  this.offset = offset || 0;
  this.view = view;
}

Decoder.prototype.map = function (length) {
  var value = {};
  for (var i = 0; i < length; i++) {
    var key = this.parse();
    value[key] = this.parse();
  }
  return value;
};

Decoder.prototype.buf = function (length) {
    var value = new ArrayBuffer(length);
    (new Uint8Array(value)).set(new Uint8Array(this.view.buffer, this.offset, length), 0);
    this.offset += length;
    return value;
};

Decoder.prototype.u8str = function (length) {
  var value = utf8Read(this.view, this.offset, length);
  this.offset += length;
  return value;
};

Decoder.prototype.array = function (length) {
  var value = new Array(length);
  for (var i = 0; i < length; i++) {
    value[i] = this.parse();
  }
  return value;
};

Decoder.prototype.ext = function (length) {
    var value = {};
    // Get the type byte
    value['type'] = this.view.getInt8(this.offset);
    this.offset++;
    // Get the data array (length)
    value['data'] = this.buf(length);
    this.offset += length;
    return value;
};

Decoder.prototype.parse = function () {
  var type = this.view.getUint8(this.offset);
  var value, length;
  
  // Positive FixInt - 0xxxxxxx
  if ((type & 0x80) === 0x00) {
    this.offset++;
    return type;
  }
  
  // FixMap - 1000xxxx
  if ((type & 0xf0) === 0x80) {
    length = type & 0x0f;
    this.offset++;
    return this.map(length);
  }
  
  // FixArray - 1001xxxx
  if ((type & 0xf0) === 0x90) {
    length = type & 0x0f;
    this.offset++;
    return this.array(length);
  }
  
  // FixStr - 101xxxxx
  if ((type & 0xe0) === 0xa0) {
    length = type & 0x1f;
    this.offset++;
    return this.u8str(length);
  }
  
  // Negative FixInt - 111xxxxx
  if ((type & 0xe0) === 0xe0) {
    value = this.view.getInt8(this.offset);
    this.offset++;
    return value;
  }

  switch (type) {

    // nil - CRWOK
    case 0xc0:
      this.offset++;
      return null;
      
    // 0xc1 never used
    
    // false - CRWOK
    case 0xc2:
      this.offset++;
      return false;
      
    // true - CRWOK
    case 0xc3:
      this.offset++;
      return true;
      
    // bin 8 - CRWOK
    case 0xc4:
      length = this.view.getUint8(this.offset + 1);
      this.offset += 2;
      return this.buf(length);
      
    // bin 16 - CRWOK
    case 0xc5:
      length = this.view.getUint16(this.offset + 1);
      this.offset += 3;
      return this.buf(length);
      
    // bin 32 - CRWOK
    case 0xc6:
      length = this.view.getUint32(this.offset + 1);
      this.offset += 5;
      return this.buf(length);
      
    // ext 8 - CRWOK
    case 0xc7:
      length = this.view.getUint8(this.offset + 1);
      this.offset += 2;
      return this.ext(length);
      
    // ext 16 - CRWOK
    case 0xc8:
      length = this.view.getUint16(this.offset + 1);
      this.offset += 3;
      return this.ext(length);
      
    // ext 32 - CRWOK
    case 0xc9:
      length = this.view.getUint32(this.offset + 1);
      this.offset += 5;
      return this.ext(length);
      
    // float
    case 0xca:
      value = this.view.getFloat32(this.offset + 1);
      this.offset += 5;
      return value;
      
    // double
    case 0xcb:
      value = this.view.getFloat64(this.offset + 1);
      this.offset += 9;
      return value;
      
    // uint8
    case 0xcc:
      value = this.view.getUint8(this.offset + 1);
      this.offset += 2;
      return value;
      
    // uint 16
    case 0xcd:
      value = this.view.getUint16(this.offset + 1);
      this.offset += 3;
      return value;
      
    // uint 32
    case 0xce:
      value = this.view.getUint32(this.offset + 1);
      this.offset += 5;
      return value;
      
    // uint 64 - UNHANDLED
    case 0xcf:
      //CRW value = this.view.getUint64(this.offset + 1);
      value = 0;
      this.offset += 9;
      return value;
      
    // int 8
    case 0xd0:
      value = this.view.getInt8(this.offset + 1);
      this.offset += 2;
      return value;
      
    // int 16
    case 0xd1:
      value = this.view.getInt16(this.offset + 1);
      this.offset += 3;
      return value;
    
    // int 32
    case 0xd2:
      value = this.view.getInt32(this.offset + 1);
      this.offset += 5;
      return value;
    
    // int 64 - UNHANDLED
    case 0xd3:
      // CRW value = this.view.getInt64(this.offset + 1);
      value = 0;
      this.offset += 9;
      return value;
    
    // fixext 1 - CRWOK
    case 0xd4:
      length = 1;
      this.offset++;
      return this.ext(length);
    
    // fixext 2 - CRWOK
    case 0xd5:
      length = 2;
      this.offset++;
      return this.ext(length);
    
    // fixext 4 - CRWOK
    case 0xd6:
      length = 4;
      this.offset++;
      return this.ext(length);
    
    // fixext 8 - CRWOK
    case 0xd7:
      length = 8;
      this.offset++;
      return this.ext(length);
    
    // fixext 16 - CRWOK
    case 0xd8:
      length = 16;
      this.offset++;
      return this.ext(length);
    
    // str8 - CRWOK
    case 0xd9:
      length = this.view.getUint8(this.offset + 1);
      this.offset += 2;
      return this.u8str(length);
      
    // str 16 - CRWOK
    case 0xda:
      length = this.view.getUint16(this.offset + 1);
      this.offset += 3;
      return this.u8str(length);

    // str 32 - CRWOK
    case 0xdb:
      length = this.view.getUint32(this.offset + 1);
      this.offset += 5;
      return this.u8str(length);

    // array 16
    case 0xdc:
      length = this.view.getUint16(this.offset + 1);
      this.offset += 3;
      return this.array(length);

    // array 32
    case 0xdd:
      length = this.view.getUint32(this.offset + 1);
      this.offset += 5;
      return this.array(length);

    // map 16
    case 0xde:
      length = this.view.getUint16(this.offset + 1);
      this.offset += 3;
      return this.map(length);

    // map 32
    case 0xdf:
      length = this.view.getUint32(this.offset + 1);
      this.offset += 5;
      return this.map(length);

  }
  throw new Error("Unknown type 0x" + type.toString(16));
};

function decode(buffer) {
  var view = new DataView(buffer);
  var decoder = new Decoder(view);
  var value = decoder.parse();
  if (decoder.offset !== buffer.byteLength) throw new Error((buffer.byteLength - decoder.offset) + " trailing bytes");
  return value;
}

function encode(value, view, offset) {
  var type = typeof value;

  // Strings Bytes
  // There are four string types: fixstr/str8/str16/str32
  if (type === "string") {
    var length = utf8ByteCount(value);
    
    // fixstr - CRWOK
    if (length < 0x20) {
      view.setUint8(offset, length | 0xa0);
      utf8Write(view, offset + 1, value);
      return 1 + length;
    }
    
    // str8 - CRWOK
    if (length < 0x100) {
      view.setUint8(offset, 0xd9);
      view.setUint8(offset + 1, length);
      utf8Write(view, offset + 2, value);
      return 2 + length;  
    }
    
    // str16 - CRWOK
    if (length < 0x10000) {
      view.setUint8(offset, 0xda);
      view.setUint16(offset + 1, length);
      utf8Write(view, offset + 3, value);
      return 3 + length;
    }
    // str32 - CRWOK
    if (length < 0x100000000) {
      view.setUint8(offset, 0xdb);
      view.setUint32(offset + 1, length);
      utf8Write(view, offset + 5, value);
      return 5 + length;
    }
  }

  // There are three: bin8/bin16/bin32
  if (value instanceof ArrayBuffer) {
    var length = value.byteLength;

    // bin8
    if (length < 0x100) {
        view.setUint8(offset, 0xc4);
        view.setUint8(offset + 1, length);
        (new Uint8Array(view.buffer)).set(new Uint8Array(value), offset + 2);
        return 2 + length;
    }
    
    // bin16
    if (length < 0x10000) {
        view.setUint8(offset, 0xc5);
        view.setUint16(offset + 1, length);
        (new Uint8Array(view.buffer)).set(new Uint8Array(value), offset + 3);
        return 3 + length;
    }
    
    // bin 32
    if (length < 0x100000000) {
        view.setUint8(offset, 0xc6);
        view.setUint32(offset + 1, length);
        (new Uint8Array(view.buffer)).set(new Uint8Array(value), offset + 5);
        return 5 + length;
    }
  }
  
  if (type === "number") {
    // Floating Point
    if ((value << 0) !== value) {
      view.setUint8(offset, 0xcb);
      view.setFloat64(offset + 1, value);
      return 9;
    }

    // Integers
    if (value >=0) {
      // positive fixnum
      if (value < 0x80) {
        view.setUint8(offset, value);
        return 1;
      }
      // uint 8
      if (value < 0x100) {
        view.setUint8(offset, 0xcc);
        view.setUint8(offset + 1, value);
        return 2;
      }
      // uint 16
      if (value < 0x10000) {
        view.setUint8(offset, 0xcd);
        view.setUint16(offset + 1, value);
        return 3;
      }
      // uint 32
      if (value < 0x100000000) {
        view.setUint8(offset, 0xce);
        view.setUint32(offset + 1, value);
        return 5;
      }
      throw new Error("Number too big 0x" + value.toString(16));
    }
    // negative fixnum
    if (value >= -0x20) {
      view.setInt8(offset, value);
      return 1;
    }
    // int 8
    if (value >= -0x80) {
      view.setUint8(offset, 0xd0);
      view.setInt8(offset + 1, value);
      return 2;
    }
    // int 16
    if (value >= -0x8000) {
      view.setUint8(offset, 0xd1);
      view.setInt16(offset + 1, value);
      return 3;
    }
    // int 32
    if (value >= -0x80000000) {
      view.setUint8(offset, 0xd2);
      view.setInt32(offset + 1, value);
      return 5;
    }
    throw new Error("Number too small -0x" + (-value).toString(16).substr(1));
  }
  
  // undefined - treat as nil
  if (type === "undefined") {
    view.setUint8(offset, 0xc0);
    return 1;
  }
  
  // null / nil
  if (value === null) {
    view.setUint8(offset, 0xc0);
    return 1;
  }

  // Boolean
  if (type === "boolean") {
    view.setUint8(offset, value ? 0xc3 : 0xc2);
    return 1;
  }
  
  // Container Types
  if (type === "object") {
    var length, size = 0;
    var isArray = Array.isArray(value);

    if (isArray) {
      length = value.length;
    }
    else {
      var keys = Object.keys(value);
      length = keys.length;
    }

    var size;
    if (length < 0x10) {
      view.setUint8(offset, length | (isArray ? 0x90 : 0x80));
      size = 1;
    }
    else if (length < 0x10000) {
      view.setUint8(offset, isArray ? 0xdc : 0xde);
      view.setUint16(offset + 1, length);
      size = 3;
    }
    else if (length < 0x100000000) {
      view.setUint8(offset, isArray ? 0xdd : 0xdf);
      view.setUint32(offset + 1, length);
      size = 5;
    }

    if (isArray) {
      for (var i = 0; i < length; i++) {
        size += encode(value[i], view, offset + size);
      }
    }
    else {
      for (var i = 0; i < length; i++) {
        var key = keys[i];
        size += encode(key, view, offset + size);
        size += encode(value[key], view, offset + size);
      }
    }
    
    return size;
  }
  throw new Error("Unknown type " + type);
}

function sizeof(value) {
  var type = typeof value;

  // fixstr or str8 or str16 or str32
  if (type === "string") {
    var length = utf8ByteCount(value);
    if (length < 0x20) {
      return 1 + length;
    }
    if (length < 0x100) {
        return 2 + length;
    }
    if (length < 0x10000) {
      return 3 + length;
    }
    if (length < 0x100000000) {
      return 5 + length;
    }
  }
  
  // bin8 or bin16 or bin32
  if (value instanceof ArrayBuffer) {
    var length = value.byteLength;
    if (length < 0x100) {
      return 2 + length;
    }
    if (length < 0x10000) {
      return 3 + length;
    }
    if (length < 0x100000000) {
      return 5 + length;
    }
  }
  
  if (type === "number") {
    // Floating Point (32 bits)
    // double
    if (value << 0 !== value) return 9;

    // Integers
    if (value >=0) {
      // positive fixint
      if (value < 0x80) return 1;
      // uint 8
      if (value < 0x100) return 2;
      // uint 16
      if (value < 0x10000) return 3;
      // uint 32
      if (value < 0x100000000) return 5;
      // uint 64
      if (value < 0x10000000000000000) return 9;
      // Too big
      throw new Error("Number too big 0x" + value.toString(16));
    }
    // negative fixint
    if (value >= -0x20) return 1;
    // int 8
    if (value >= -0x80) return 2;
    // int 16
    if (value >= -0x8000) return 3;
    // int 32
    if (value >= -0x80000000) return 5;
    // int 64
    if (value >= -0x8000000000000000) return 9;
    // Too small
    throw new Error("Number too small -0x" + value.toString(16).substr(1));
  }
  
  // Boolean, null, undefined
  if (type === "boolean" || type === "undefined" || value === null) return 1;
  
  // Container Types
  if (type === "object") {
    var length, size = 0;
    if (Array.isArray(value)) {
      length = value.length;
      for (var i = 0; i < length; i++) {
        size += sizeof(value[i]);
      }
    }
    else {
      var keys = Object.keys(value);
      length = keys.length;
      for (var i = 0; i < length; i++) {
        var key = keys[i];
        size += sizeof(key) + sizeof(value[key]);
      }
    }
    if (length < 0x10) {
      return 1 + size;
    }
    if (length < 0x10000) {
      return 3 + size;
    }
    if (length < 0x100000000) {
      return 5 + size;
    }
    throw new Error("Array or object too long 0x" + length.toString(16));
  }
  
  throw new Error("Unknown type " + type);
}

return exports;

});
