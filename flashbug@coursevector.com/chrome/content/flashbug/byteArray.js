FBL.ns(function() { with (FBL) {
	
/**
 * @author Gabriel Mariani
 *
 * Looked to FireAMF for some help http://code.google.com/p/fireamf/
 */

Flashbug.ByteArray = function(inputStream, isBinary) {
	
	//--------------------------------------
	//  Constructor
	//--------------------------------------
	
	// Init file stream
	if(!isBinary) {
		var binaryStream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
		binaryStream.setInputStream(inputStream);
	}
	
	//--------------------------------------
	//  Public Vars
	//--------------------------------------
	
	//--------------------------------------
	//  Private Vars
	//--------------------------------------
	
	this._converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter);
	this._converter.charset = "UTF-8";
	
	// Can ony be big endian
	//this.endian = "bigEndian";
	
	// We are not doing AMF encoding here
	//this.objectEncoding = 3;
	
	// File Stream
	this._stream = isBinary ? inputStream : binaryStream;
	
	// Byte length
	this._length = this._stream.available();
};

Flashbug.ByteArray.prototype = {
	
	close: function() {
		this._stream.close();
	},
	
	/**
	Determine number of bytes available in the stream.  A non-blocking
	stream that does not yet have any data to read should return 0 bytes
	from this method (i.e., it must not throw the NS_BASE_STREAM_WOULD_BLOCK
	exception).
	
	In addition to the number of bytes available in the stream, this method
	also informs the caller of the current status of the stream.  A stream
	that is closed will throw an exception when this method is called.  That
	enables the caller to know the condition of the stream before attempting
	to read from it.  If a stream is at end-of-file, but not closed, then
	this method should return 0 bytes available.
	
	@return number of bytes currently available in the stream, or PR_UINT32_MAX 
	if the size of the stream exceeds PR_UINT32_MAX.
    */
	getBytesAvailable: function() {
		return this._stream.available();
	},
	
	getPosition: function() {
		//return this._position;
		return this._stream.tell();
	},
	
	getLength: function() {
		return this._length;
	},
	
	/**
	Reads an 8-bit value from the stream, treating it as a Boolean value.
	*/
	readBoolean: function() {
		return !!this._stream.readBoolean();
	},
	
	readByte: function() {
		return this.readUnsignedByte();
	},
	
	/*readBytes: function(bytes, offset = 0, length = 0) {
		//
	},*/
	
	/**
	A double read from the stream.
	*/
	readDouble: function() {
		return (+this._stream.readDouble());
	},
	
	/**
	A float read from the stream.
	*/
	readFloat: function() {
		return (+this._stream.readFloat());
	},
	
	/*readInt: function() {
		//
	},*/
	
	/**
	Reads a multibyte string of specified length from the byte stream using the specified character set. 
	*/
	readMultiByte: function(length, charSet) {
		return this._stream.readBytes(length);
	},
	
	/*readObject: function() {
		//
	},
	
	readShort: function() {
		//
	},*/
	
	/**
	An 8-bit integer read from the stream.
	*/
	readUnsignedByte: function() {
		return this._stream.read8();
	},
	
	/**
	A 32-bit integer read from the stream.
	*/
	readUnsignedInt: function() {
		return (+this._stream.read32());
	},
	
	/**
	A 16-bit integer read from the stream.
	*/
	readUnsignedShort: function() {
		return (+this._stream.read16());
	},
	
	/**
	Reads a single ASCII character
	*/
	readCString: function() {
		return String.fromCharCode(this.readByte());
	},
	
	/**
	Reads a line of ASCII characters
	*/
	readString: function() {
		var line = "";
		var size = this.getBytesAvailable();
		for (var i = 0; i < size; i++) {
			var c = this.readCString();
			if (c == '\r') {
				//
			} else if (c == '\n') {
				break;
			} else {
				line += c;
			}
		}
		return line;
	},
	
	/**
	Reads a UTF-8 string from the byte stream. The string is assumed to be 
	prefixed with an unsigned short indicating the length in bytes. 
	*/
	readUTF: function() {
		var length = this.readUnsignedShort();
		return this.readUTFBytes(length);
	},
	
	/**
	Reads a sequence of UTF-8 bytes specified by the length parameter from the byte stream and returns a string. 
	*/
	readUTFBytes: function(remaining) {
		var count = this.getBytesAvailable(),
		ba = [], 
		chunk,
		read;
		
		// Uses a loop to handle non-blocking
		while (remaining && count) {
			read = (count < remaining) ? count : remaining;
			chunk = this._stream.readByteArray(read);
			ba.push.apply(ba, chunk);
			remaining -= read;
			count = this.getBytesAvailable();
		}
		
		return this._converter.convertFromByteArray(ba, ba.length);
	}
	
	/*writeBoolean: function(value) {
		//
	},
	
	writeByte: function(value) {
		//
	},
	
	writeBytes: function(bytes, offset, length) {
		//
	},
	
	writeDouble: function(value) {
		//
	},
	
	writeFloat: function(value) {
		//
	},
	
	writeInt: function(value) {
		//
	},
	
	writeMultiByte: function(value, charSet) {
		//
	},
	
	writeObject: function() {
		//
	},
	
	writeShort: function(value) {
		//
	},
	
	writeUnsignedInt: function(value) {
		//
	},
	
	writeUTF: function(value) {
		//
	},
	
	writeUTFBytes: function(value) {
		//
	}*/
};

}});