/**
 * @author Gabriel Mariani
 *
 * http://www.adamia.com/blog/high-performance-javascript-port-of-actionscript-byteArray
 */
 
var DEFLATE_CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15],
	DEFLATE_CODE_LENGHT_MAP = [
		[0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8], [0, 9], [0, 10], [1, 11], [1, 13], [1, 15], [1, 17],
		[2, 19], [2, 23], [2, 27], [2, 31], [3, 35], [3, 43], [3, 51], [3, 59], [4, 67], [4, 83], [4, 99],
		[4, 115], [5, 131], [5, 163], [5, 195], [5, 227], [0, 258]
	],
	DEFLATE_DISTANCE_MAP = [
		[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [1, 7], [2, 9], [2, 13], [3, 17], [3, 25], [4, 33], [4, 49],
		[5, 65], [5, 97], [6, 129], [6, 193], [7, 257], [7, 385], [8, 513], [8, 769], [9, 1025], [9, 1537],
		[10, 2049], [10, 3073], [11, 4097], [11, 6145], [12, 8193], [12, 12289], [13, 16385], [13, 24577]
	];
	
var fromCharCode = String.fromCharCode,
pow = Math.pow,
min = Math.min,
max = Math.max;
	
function buildHuffTable(bitLengths) {
	var numLengths = bitLengths.length,
		blCount = [],
		maxBits = max.apply(Math, bitLengths),
		nextCode = [],
		code = 0,
		table = {},
		i = numLengths;
	while (i--) {
		var len = bitLengths[i];
		blCount[len] = (blCount[len] || 0) + (len > 0);
	}
	
	for (var i = 1; i <= maxBits; i++) {
		var len = i - 1;
		if (undefined == blCount[len]) blCount[len] = 0;
		code = (code + blCount[i - 1]) << 1;
		nextCode[i] = code;
	}
	
	for (var i = 0; i < numLengths; i++) {
		var len = bitLengths[i];
		if (len) {
			table[nextCode[len]] = {
				length: len,
				symbol: i
			};
			nextCode[len]++;
		}
	}
	return table;
}

function decodeSymbol(s, table) {
	var code = 0,
		len = 0;
	while (true) {
		code = (code << 1) | s.readUB(1, true);
		len++;
		var entry = table[code];
		if (undefined != entry && entry.length == len) return entry.symbol;
	}
}

var Flashbug = Flashbug || {};
Flashbug.ByteArrayString = function(data, endian) {
	
	if(data == undefined) data = '';
	var buff = [], t = this, i = t.length = data.length;
	t.position = 0;
	t.endian = (endian !== undefined) ? endian : Flashbug.ByteArrayString.BIG_ENDIAN;
	t._bitBuffer = null;
	t._bitPosition = 8;
	
	// Convert to data
	for (var i = 0; data[i]; i++) {
		buff.push(fromCharCode(data.charCodeAt(i) & 0xff));
	}
	t._buffer = buff.join('');

	// Add redundant members that match actionscript for compatibility
	var funcMap = {
		readUnsignedByte: 'readUI8', 	readUnsignedShort: 'readUI16', 	readUnsignedInt: 'readUI32', 
		readByte: 'readSI8', 			readShort: 'readSI16', 			readInt: 'readSI32', 
		readBoolean: 'readBool', 
		writeUnsignedByte: 'writeUI8', 	writeUnsignedShort: 'writeUI16', writeUnsignedInt: 'writeUI32',
		writeByte: 'writeSI8', 			writeShort: 'writeSI16', 		writeInt: 'writeSI32'};
	for (var func in funcMap) {
		t[func] = t[funcMap[func]];
	}
};

Flashbug.ByteArrayString.BIG_ENDIAN = "bigEndian";
Flashbug.ByteArrayString.LITTLE_ENDIAN = "littleEndian";

Flashbug.ByteArrayString.prototype = {
	
	getBytesAvailable: function() {
		return this.length - this.position;
	},
	
	seek: function(offset, absolute) {
		var t = this;
		t.position = (absolute ? 0 : t.position) + offset;
		t.align();
		return t;
	},
	
	readBytes: function(length) {
		var pos = (this.position += length) - length;
		return this._buffer.slice(pos, this.position);
	},
	
	writeBytes: function(value) {
		this._buffer += value;
		this.position += value.length;
	},
	
	deflate: function(parseLimit) {
		var t = this,
			b = t._buffer,
			o = t.position,
			data = b.substr(0, o) + t.unzip(parseLimit);
		t.length = data.length;
		t.position = o;
		t._buffer = data;
		return t;
	},
	
	unzip: function uz(raw, parseLimit) {
		var t = this,
			buff = [],
			o = DEFLATE_CODE_LENGTH_ORDER,
			m = DEFLATE_CODE_LENGHT_MAP,
			d = DEFLATE_DISTANCE_MAP;
		
		// Skip past ZLIB metadata
		t.seek(2);
		
		var trace = function(msg) {
			//if (typeof FBTrace.sysout == "undefined") {
				dump("ByteArrayString:: " + msg + "\n");
			//} else {
			//	FBTrace.sysout("ZipUtil:: " + msg, obj);
			//}
		};
		
		do {
			var isFinal = t.readUB(1, true),
				type = t.readUB(2, true);
				
			switch(type) {
				case 0:
					trace("Stored");
					break;
				case 1:
					trace("Fixed Huffman codes");
					break;
				case 2:
					trace("Dynamic Huffman codes");
					break;
				case 3:
					trace("Reserved block type!!");
					break;
				default:
					trace("Unexpected value " + type + "!");
					break;
			}
			
			if (type) {
				if (1 == type) {
					// Fixed Huffman codes
					var distTable = uz.fixedDistTable,
						litTable = uz.fixedLitTable;
					if (!distTable) {
						var bitLengths = [];
						for (var i = 0; i < 32; i++) {
							bitLengths.push(5);
						}
						distTable = uz.fixedDistTable = buildHuffTable(bitLengths);
					}
					if (!litTable) {
						var bitLengths = [];
						for (var i = 0; i <= 143; i++){ bitLengths.push(8); }
						for (; i <= 255; i++){ bitLengths.push(9); }
						for (; i <= 279; i++){ bitLengths.push(7); }
						for (; i <= 287; i++){ bitLengths.push(8); }
						litTable = uz.fixedLitTable = buildHuffTable(bitLengths);
					}
				} else {
					// Dynamic Huffman codes OR Reserved block type OR Unexpected value type
					var numLitLengths = t.readUB(5, true) + 257,
						numDistLengths = t.readUB(5, true) + 1,
						numCodeLenghts = t.readUB(4, true) + 4,
						codeLengths = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
					for (var i = 0; i < numCodeLenghts; i++){ codeLengths[o[i]] = t.readUB(3, true); }
					var codeTable = buildHuffTable(codeLengths),
						litLengths = [],
						prevCodeLen = 0,
						maxLengths = numLitLengths + numDistLengths;
					while (litLengths.length < maxLengths) {
						var sym = decodeSymbol(t, codeTable);
						switch (sym) {
							case 16:
								var i = t.readUB(2, true) + 3;
								while (i--) { litLengths.push(prevCodeLen); }
								break;
							case 17:
								var i = t.readUB(3, true) + 3;
								while (i--) { litLengths.push(0); }
								break;
							case 18:
								var i = t.readUB(7, true) + 11;
								while (i--) { litLengths.push(0); }
								break;
							default:
								if (sym <= 15) {
									litLengths.push(sym);
									prevCodeLen = sym;
								}
						}
					}
					var distTable = buildHuffTable(litLengths.splice(numLitLengths, numDistLengths)),
						litTable = buildHuffTable(litLengths);
				}
				
				do {
					var sym = decodeSymbol(t, litTable);
					if(sym < 256) {
						buff.push(raw ? sym : fromCharCode(sym));
					} else if (sym > 256) {
						var lengthMap = m[sym - 257],
							len = lengthMap[1] + t.readUB(lengthMap[0], true),
							distMap = d[decodeSymbol(t, distTable)],
							dist = distMap[1] + t.readUB(distMap[0], true),
							i = buff.length - dist;
							// 004,294,967,295
							// 000,105,643,990 : 258
							//dump(buff.length + ' : ' + len + '\n');
						while (len--) { buff.push(buff[i++]); }
					}
				} while(256 != sym);
			} else {
				// Stored 
				t.align();
				var len = t.readUI16(),
					nlen = t.readUI16();
				if (raw) {
					while (len--) { buff.push(t.readUI8()); }
				} else {
					buff.push(t.readString(len));
				}
			}
			
			if (parseLimit && buff.length > parseLimit) isFinal = true;
		} while(!isFinal);
		
		// ADLER32
		t.seek(4);
		
		return raw ? buff : buff.join('');
	},

	/////////////////////////////////////////////////////////
	// Integers
	/////////////////////////////////////////////////////////

	readByteAt: function(pos) {
		return this._buffer.charCodeAt(pos);
	},
	
	writeByteAt: function(pos, value) {
		this._buffer += this._buffer.substr(0, pos) + String.fromCharCode(value) + this._buffer.substr(pos + 1);
	},

	// Unsigned Number
	readNumber: function(numBytes, bigEnd) {
		var t = this, val = 0;
		if (bigEnd == undefined) bigEnd = !!(this.endian == Flashbug.ByteArrayString.BIG_ENDIAN);
		if (bigEnd) {
			while (numBytes--) val = (val << 8) | t.readByteAt(t.position++);
		} else {
			var o = t.position, i = o + numBytes;
			while(i > o) val = (val << 8) | t.readByteAt(--i);
			t.position += numBytes;
		}
		
		t.align();
		return val;
	},
	
	writeNumber: function(numBytes, value, bigEnd) {
		//http://jsfromhell.com/classes/binary-parser
		var t = this, bits = numBytes * 8, max = pow(2, bits), r = [];
		//(value >= max || value < -(max >> 1)) && this.warn("encodeInt::overflow") && (value = 0);
		if (value < 0) value += max;
		for(; value; r[r.length] = String.fromCharCode(value % 256), value = Math.floor(value / 256));
		for(bits = -(-bits >> 3) - r.length; bits--; r[r.length] = "\0");
		if (bigEnd == undefined) bigEnd = !!(t.endian == Flashbug.ByteArrayString.BIG_ENDIAN);
		var numStr = (bigEnd ? r.reverse() : r).join('');
		t.writeBytes(numStr);
		t.position += numBytes;
		t.align();
	},

	// Signed Number
	readSNumber: function(numBytes, bigEnd) {
		var val = this.readNumber(numBytes, bigEnd), numBits = numBytes * 8;
		if (val >> (numBits - 1)) val -= pow(2, numBits);
		return val;
	},
	
	writeSNumber: function(numBytes, value, bigEnd) {
		this.writeNumber(numBytes, value, bigEnd)
	},

	readSI8: function() {
		return this.readSNumber(1);
	},
	
	writeSI8: function(value) {
		this.writeSNumber(1, value);
	},

	readSI16: function(bigEnd) {
		return this.readSNumber(2, bigEnd);
	},
	
	writeSI16: function(value, bigEnd) {
		this.writeSNumber(2, value, bigEnd);
	},

	readSI32: function(bigEnd) {
		return this.readSNumber(4, bigEnd);
	},
	
	writeSI32: function(value, bigEnd) {
		this.writeSNumber(4, value, bigEnd);
	},

	readUI8: function() {
		return this.readNumber(1);
	},
	
	writeUI8: function(value) {
		this.writeNumber(1, value);
	},

	readUI16: function(bigEnd) {
		return this.readNumber(2, bigEnd);
	},
	
	writeUI16: function(value, bigEnd) {
		this.writeNumber(2, value, bigEnd);
	},

	readUI24: function(bigEnd) {
		return this.readNumber(3, bigEnd);
	},
	
	writeUI24: function(value, bigEnd) {
		this.writeNumber(3, value, bigEnd);
	},

	readUI32: function(bigEnd) {
		return this.readNumber(4, bigEnd);
	},
	
	writeUI32: function(value, bigEnd) {
		this.writeNumber(4, value, bigEnd);
	},

	/////////////////////////////////////////////////////////
	// Fixed-point numbers
	/////////////////////////////////////////////////////////

	_readFixedPoint: function(numBits, precision) {
		return this.readSB(numBits) * pow(2, -precision);
	},

	readFixed: function() {
		return this._readFixedPoint(32, 16);
	},

	readFixed8: function() {
		return this._readFixedPoint(16, 8);
	},

	readFB: function(numBits) {
		return this._readFixedPoint(numBits, 16);
		
		// SWFAssist
		//return this.readSB(numBits) / 65536;
	},

	/////////////////////////////////////////////////////////
	// Floating-point numbers
	/////////////////////////////////////////////////////////

	_readFloatingPoint: function(numEBits, numSBits) {
		var numBits = 1 + numEBits + numSBits,
			numBytes = numBits / 8,
			t = this,
			val = 0.0;
		if (numBytes > 4) {
			var i = Math.ceil(numBytes / 4);
			while (i--) {
				var buff = [],
					o = t.position,
					j = o + (numBytes >= 4 ? 4 : numBytes % 4);
				while (j > o) {
					buff.push(t.readByteAt(--j));
					numBytes--;
					t.position++;
				}
			}
			var s = new Flashbug.ByteArrayString(fromCharCode.apply(String, buff)),
				sign = s.readUB(1),
				expo = s.readUB(numEBits),
				mantis = 0,
				i = numSBits;
			while(i--){
				if (s.readBool()) mantis += pow(2, i);
			}
		} else {
			var sign = t.readUB(1),
				expo = t.readUB(numEBits),
				mantis = t.readUB(numSBits);
		}
		if (sign || expo || mantis) {
			var maxExpo = pow(2, numEBits),
				bias = ~~((maxExpo - 1) / 2),
				scale = pow(2, numSBits),
				fract = mantis / scale;
			if (bias) {
				if (bias < maxExpo) {
					val = pow(2, expo - bias) * (1 + fract);
				} else if (fract) {
					val = NaN;
				} else {
					val = Infinity;
				}
			} else if (fract) {
				val = pow(2, 1 - bias) * fract;
			}
			if (NaN != val && sign) val *= -1;
		}
		return val;
	},

	readFloat: function() {
		return this._readFloatingPoint(8, 23);
	},

	readFloat16: function() {
		return this._readFloatingPoint(5, 10);
	},

	readDouble: function(bigEnd) {
		// correct 1282653634986
		var t = this, TWOeN52 = pow(2, -52);
		
		if (bigEnd == undefined) bigEnd = !!(this.endian == Flashbug.ByteArrayString.BIG_ENDIAN);
		if (bigEnd) {
			var pos = (t.position += 8) - 8,
				b1 = t.readByteAt(pos),
				b2 = t.readByteAt(++pos),
				b3 = t.readByteAt(++pos),
				b4 = t.readByteAt(++pos),
				b5 = t.readByteAt(++pos),
				b6 = t.readByteAt(++pos),
				b7 = t.readByteAt(++pos),
				b8 = t.readByteAt(++pos);
		} else {
			var pos = (t.position += 8),
				b1 = t.readByteAt(--pos),
				b2 = t.readByteAt(--pos),
				b3 = t.readByteAt(--pos),
				b4 = t.readByteAt(--pos),
				b5 = t.readByteAt(--pos),
				b6 = t.readByteAt(--pos),
				b7 = t.readByteAt(--pos),
				b8 = t.readByteAt(--pos);
		}
		
		var sign = 1 - ((b1 >> 7) << 1);									// sign = bit 0
		var exp = (((b1 << 4) & 0x7FF) | (b2 >> 4)) - 1023;					// exponent = bits 1..11
		
		// This crazy toString() stuff works around the fact that js ints are
		// only 32 bits and signed, giving us 31 bits to work with
		var sig = 	(((b2 & 0xF) << 16) | (b3 << 8) | b4).toString(2) +
					((b5 >> 7) ? '1' : '0') +
					(((b5 & 0x7F) << 24) | (b6 << 16) | (b7 << 8) | b8).toString(2);	// significand = bits 12..63
		
		sig = parseInt(sig, 2);
		if (sig == 0 && exp == -1023) return 0.0;
		return sign * (1.0 + TWOeN52 * sig) * pow(2, exp);
		
		// wrong  1.14669963550697e-305
		//return this._readFloatingPoint(11, 52);
	},

	/////////////////////////////////////////////////////////
	// Encoded integer
	/////////////////////////////////////////////////////////

	readEncodedU32: function() {
		var val = 0;
		for(var i = 0; i < 5; i++) {
			var num = this.readByteAt(this.position++);
			val = val | ((num & 0x7f) << (7 * i));
			if (!(num & 0x80)) break;
		}
		return val;
	},

	/////////////////////////////////////////////////////////
	// Bit values
	/////////////////////////////////////////////////////////

	align: function() {
		this._bitPosition = 8;
		this._bitBuffer = null;
	},

	readUB: function(numBits, lsb) {
		var t = this, val = 0;
		for(var i = 0; i < numBits; i++) {
			if (8 == t._bitPosition) {
				t._bitBuffer = t.readUI8();
				t._bitPosition = 0;
			}
			
			if (lsb) {
				val |= (t._bitBuffer & (0x01 << t._bitPosition++) ? 1 : 0) << i;
			} else {
				val = (val << 1) | (t._bitBuffer & (0x80 >> t._bitPosition++) ? 1 : 0);
			}
		}
		
		return val;
	},
	
	writeUB: function(value, numBits) {
		if (0 == numBits) return;
		
		var t = this;
		if (t._bitPosition == 0) t._bitPosition = 8;
		
		while (numBits > 0) {
			while (t._bitPosition > 0 && numBits > 0) {
				if ((value & (0x01 << (numBits - 1))) != 0) {
					t._bitBuffer = t._bitBuffer | (0x01 << (t._bitPosition - 1));
				}
				
				--numBits;
				--t._bitPosition;
			}
			
			if (0 == t._bitPosition) {
				t.writeUI8(t._bitBuffer);
				t._bitBuffer = 0;
				
				if (numBits > 0) t._bitPosition = 8;
			}
		}
		
		/*if (numBits == 0) return;
		
		var t = this;
		if (t._bitPosition == 0) {
			t._bitBuffer = 0;
			t._bitPosition = 8;
		}
		
		for (;;) {
			if (numBits > t._bitPosition) {
				t._bitBuffer = (t._bitBuffer | ((value << (32 - numBits)) >>> (32 - t._bitPosition))) & 0xff;
				t.writeUI8(t._bitBuffer);
				numBits -= t._bitPosition;
				t._bitBuffer = 0;
				t._bitPosition = 8;
			} else {
				t._bitBuffer = (t._bitBuffer |= ((value << (32 - numBits)) >>> (32 - t._bitPosition))) & 0xff;
				t.writeUI8(t._bitBuffer);
				t._bitPosition -= numBits;
				break;
			}
		}*/
	},

	readSB: function(numBits) {
		var val = this.readUB(numBits);
		
		// SWFAssist
		var shift = 32 - numBits;
		var result = (val << shift) >> shift;
		return result;
		
		// Gordon
		//if (val >> (numBits - 1)) val -= pow(2, numBits);
		//return val;
	},
	
	writeSB: function(value, numBits) {
		writeUB(value | ((value < 0 ? 0x80000000 : 0x00000000) >> (32 - numBits)), numBits);
	},

	/////////////////////////////////////////////////////////
	// String
	/////////////////////////////////////////////////////////
	
	/**
	Reads a single UTF-8 character
	http://www.codeproject.com/KB/ajax/ajaxunicode.aspx
	*/
	readUTFChar: function() {
		var pos = (this.position++);
		var code = this._buffer.charCodeAt(pos);
		var rawChar = this._buffer.charAt(pos);
		
		// needs to be an HTML entity
		if (code > 255) {
			// normally we encounter the High surrogate first
			if (0xD800 <= code && code <= 0xDBFF) {
				hi  = code;
				lo = this._buffer.charCodeAt(pos + 1);
				// the next line will bend your mind a bit
				code = ((hi - 0xD800) * 0x400) + (lo - 0xDC00) + 0x10000;
				this.position++; // we already got low surrogate, so don't grab it again
			}
			// what happens if we get the low surrogate first?
			else if (0xDC00 <= code && code <= 0xDFFF) {
				hi  = this._buffer.charCodeAt(pos-1);
				lo = code;
				code = ((hi - 0xD800) * 0x400) + (lo - 0xDC00) + 0x10000;
			}
			// wrap it up as Hex entity
			c = "" + code.toString(16).toUpperCase() + ";";
		} else {
			c = rawChar;
		}
		
		return c;
	},
	
	/*writeUTFChar: function(rawChar) {
		var code = rawChar.charCodeAt(0);
		
		// if an HTML entity
		if (code > 255) {
			this._buffer += String.fromCharCode((code >>> 8) & 0xFF);
			this._buffer += String.fromCharCode(code);
		} else {
			this._buffer += String.fromCharCode(code);
		}
	},*/
	
	readUTFBytes: function(numChars) {
		var t = this, str = null, chars = [];
		var endPos = t.position + numChars;
		while(t.position < endPos) {
			chars.push(this.readUTFChar());
		}
		str = chars.join('');
		return str;
	},
	
	writeUTFBytes: function(value) {
		/*var t = this, chars = value.split(''), l = value.length;
		while(l--) {
			this.writeUTFChar(chars.shift());
			this.position++;
		}*/
		this.writeBytes(value);
	},
	
	/**
	Reads a UTF-8 string from the byte stream. The string is assumed to be 
	prefixed with an unsigned short indicating the length in bytes. 
	*/
	readUTF: function() {
		var len = this.readUI16();
		return this.readUTFBytes(len);
	},
	
	writeUTF: function(value) {
		this.writeUI16(value.length);
		this.writeUTFBytes(value);
	},

	/*
	In SWF 5 or earlier, STRING values are encoded using either ANSI (which is a superset of
	ASCII) or shift-JIS (a Japanese encoding). You cannot indicate the encoding that is used;
	instead, the decoding choice is made according to the locale in which Flash Player is running.
	This means that text content in SWF 5 or earlier can only be encoded in ANSI or shift-JIS,
	and the target audience must be known during authoring—otherwise garbled text results.

	In SWF 6 or later, STRING values are always encoded by using the Unicode UTF-8 standard.
	This is a multibyte encoding; each character is composed of between one and four bytes.
	UTF-8 is a superset of ASCII; the byte range 0 to 127 in UTF-8 exactly matches the ASCII
	mapping, and all ASCII characters 0 to 127 are represented by just one byte. UTF-8
	guarantees that whenever a character other than character 0 (the null character) is encoded by
	using more than one byte, none of those bytes are zero. This avoids the appearance of internal
	null characters in UTF-8 strings, meaning that it remains safe to treat null bytes as string
	terminators, just as for ASCII strings.
	*/
	readString: function(numChars, simple) {
		// TODO: If Flash 5- read ANSI or shift-JIS
		
		var t = this, b = t._buffer, str = null;
		if (undefined != numChars) {
			str = b.substr(t.position, numChars);
			t.position += numChars;
		} else {
			var chars = [], i = t.length - t.position;
			while (i--) {
				var code = t.readByteAt(t.position++), code2, code3;
				if (code) {
					if (simple) {
						// Read raw
						chars.push(fromCharCode(code));
					} else {
						// Fix multibyte UTF characters
						if (code < 128) {
							chars.push(fromCharCode(code));
						} else if ((code > 191) && (code < 224)) {
							code2 = t.readByteAt(t.position++);
							chars.push(fromCharCode(((code & 31) << 6) | (code2 & 63)));
							i--;
						} else {
							code2 = t.readByteAt(t.position++);
							code3 = t.readByteAt(t.position++);
							chars.push(fromCharCode(((code & 15) << 12) | ((code2 & 63) << 6) | (code3 & 63)));
							i -= 2;
						}
					}
				} else {
					break;
				}
			}
			str = chars.join('');
		}
		
		// Fix ™ entity
		//str = str.replace('â¢', '™', 'g');
		
		return str;
	},
	
	/////////////////////////////////////////////////////////
	// Boolean
	/////////////////////////////////////////////////////////
	
	readBool: function(numBits) {
		return !!this.readUB(numBits || 1);
	},

	/////////////////////////////////////////////////////////
	// Language code
	/////////////////////////////////////////////////////////

	readLANGCODE: function() {
		return this.readUI8();
	},

	/////////////////////////////////////////////////////////
	// Color records
	/////////////////////////////////////////////////////////

	readRGB: function() {
		return {
			red: this.readUI8(),
			green: this.readUI8(),
			blue: this.readUI8()
		}
		/*var r = this.readUI8();
		var g = this.readUI8();
		var b = this.readUI8();
		return (r << 16) | (g << 8) | b;*/
	},

	readRGBA: function() {
		var rgba = this.readRGB();
		rgba.alpha = this.readUI8() / 255;
		return rgba;
		/*var rgb = this.readRGB();
		var a = this.readUI8() / 255;
		return a << 24 | rgb;*/
	},

	readARGB: function(ba) {
		var alpha = this.readUI8() / 255, rgba = this.readRGB();
		rgba.alpha = alpha;
		return rgba;
		/*var a = this.readUI8() / 255;
		var rgb = this.readRGB();
		return (a << 24) | rgb;*/
	},

	/////////////////////////////////////////////////////////
	// Rectangle record
	/////////////////////////////////////////////////////////

	readRect: function() {
		var t = this, numBits = t.readUB(5),
		rect = {
			left: t.readSB(numBits),
			right: t.readSB(numBits),
			top: t.readSB(numBits),
			bottom: t.readSB(numBits)
		};
		t.align();
		return rect;
	},
	
	readMatrix: function() {
		var t = this,
			hasScale = t.readBool();
		if (hasScale) {
			var numBits = t.readUB(5),
				scaleX = t.readFB(numBits),
				scaleY = t.readFB(numBits);
		} else {
			var scaleX = scaleY = 1.0;
		}
		
		var hasRotation = t.readBool();
		if (hasRotation) {
			var numBits = t.readUB(5),
				skewX = t.readFB(numBits),
				skewY = t.readFB(numBits);
		} else {
			var skewX =  skewY = 0.0;
		}
		
		var numBits = t.readUB(5);
			matrix = {
				scaleX: scaleX, scaleY: scaleY,
				skewX: skewX, skewY: skewY,
				moveX: t.readSB(numBits), moveY: t.readSB(numBits)
			};
		t.align();
		return matrix;
	},
};