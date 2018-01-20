FBL.ns(function() { with (FBL) {

if (typeof FBTrace == "undefined") FBTrace = { };

var trace = function(msg) {
	if (FBTrace.DBG_FLASH_AMF0) {
		if (typeof FBTrace.sysout == "undefined") {
			alert(msg);
		} else {
			FBTrace.sysout(msg);
		}
	}
};

	
Flashbug.AMF0 = function() {
	
	//--------------------------------------
	//  Public Vars
	//--------------------------------------
	
	//--------------------------------------
	//  Private Vars
	//--------------------------------------
	
	// The actual object cache used to store references
	this.objCache = [];
	
	// The raw binary data
	this._rawData;
	
	// The decoded data
	this._data;
	
	this._amf3 = new Flashbug.AMF3();
	
	//--------------------------------------
	//  Constructor
	//--------------------------------------
	
};

Flashbug.AMF0.prototype = {
	
	deserialize: function(data) {
		this.clearCache();
		this._rawData = data;
		this._data = this.readData(this._rawData);
	},
	
	clearCache: function() {
		this.objCache = [];
		this._amf3.clearCache();
	},
	
	readData: function(ba) {
		var type = ba.readByte();
		return this.getDataByType(ba, type);
	},
	
	getDataByType: function(ba, type) {
		switch(type) {
			case 0x00 : return this.readNumber(ba); 		// Number
			case 0x01 : return this.readBoolean(ba); 		// Boolean
			case 0x02 : return this.readString(ba); 		// String
			case 0x03 : return this.readObject(ba); 		// Object
			case 0x04 : return null; 						// MovieClip; reserved, not supported
			case 0x05 : return null; 						// Null
			case 0x06 : return this.readUndefined(ba); 		// Undefined
			case 0x07 : return this.readReference(ba); 		// Reference
			case 0x08 : return this.readMixedArray(ba); 	// ECMA Array (associative)
			//case 0x09 : 									// Object End Marker
			case 0x0A : return this.readArray(ba); 			// Strict Array
			case 0x0B : return this.readDate(ba); 			// Date
			case 0x0C : return this.readLongString(ba); 	// Long String, string.length > 2^16
			case 0x0D : return null; 						// Unsupported
			case 0x0E : return null;						// Recordset; reserved, not supported
			case 0x0F : return this.readXML(ba); 			// XML Document
			case 0x10 : return this.readCustomClass(ba); 	// Typed Object (Custom Class)
			case 0x11 : return this._amf3.readData(ba);		// AMF3 Switch
			/*
			With the introduction of AMF 3 in Flash Player 9 to support ActionScript 3.0 and the 
			new AVM+, the AMF 0 format was extended to allow an AMF 0 encoding context to be 
			switched to AMF 3. To achieve this, a new type marker was added to AMF 0, the 
			avmplus-object-marker. The presence of this marker signifies that the following Object is 
			formatted in AMF 3.
			*/
			default: throw Error("AMF0::readData - Error : Undefined AMF0 type encountered '" + type + "'");
		}
	},
	
	readNumber: function(ba) {
		return ba.readDouble();
	},
	
	readBoolean: function(ba) {
		return ba.readBoolean();
	},
	
	readString: function(ba) {
		return ba.readUTF();
	},
	
	/**
	 * readObject reads the name/value properties of the amf message
	 */
	readObject: function(ba) {
		var obj = new Object();
		var varName = ba.readUTF();
		var type = ba.readByte();
		
		while(type != 0x09) {
			// Since readData checks type again
			/*ba.position--;
			
			obj[varName] = this.readData(ba);*/
			
			obj[varName] = this.getDataByType(ba, type);
			
			varName = ba.readUTF();
			type = ba.readByte();
		}
		
		this.objCache.push(obj);
		return obj;
	},
	
	readUndefined: function(ba) {
		return undefined;
	},
	
	/**
	 * readReference replaces the old readFlushedSO. It treats where there
	 * are references to other objects. Currently it does not resolve the
	 * object as this would involve a serious amount of overhead, unless
	 * you have a genius idea 
	 */
	readReference: function(ba) {
		var ref = ba.readUnsignedShort();
		return this.objCache[ref];
	},
	
	/**
	 * An ECMA Array or 'associative' Array is used when an ActionScript Array contains 
	 * non-ordinal indices. This type is considered a complex type and thus reoccurring 
	 * instances can be sent by reference. All indices, ordinal or otherwise, are treated 
	 * as string 'keys' instead of integers. For the purposes of serialization this type 
	 * is very similar to an anonymous Object.
	 */
	readMixedArray: function(ba) {
		var arr = [];
		
		var l = ba.readUnsignedInt();
		for(var i = 0; i < l; i++) {
			var key = ba.readUTF();
			var value = this.readData(ba);
			
			arr[key] = value;
		}
		
		this.objCache.push(arr);
		
		// End tag 00 00 09
		ba.readMultiByte(3); // ba.position += 3;
		
		return arr;
	},
	
	/**
	 * readArray turns an all numeric keyed actionscript array
	 */
	readArray: function(ba) {
		var arr = [];
		var l = ba.readUnsignedInt();
		for (var i = 0; i < l; i++) {
			arr.push(this.readData(ba));
		}
		
		this.objCache.push(arr);
		return arr;
	},
	
	/**
	 * readDate reads a date from the amf message
	 */
	readDate: function(ba) {
		var ms = ba.readDouble();
		var timezone = ba.readShort(); // reserved, not supported. should be set to 0x0000
		/*
		if (timezone > 720) {
			timezone = -(65536 - timezone);
		}
		timezone *= -60;*/
		
		var varVal = new Date();
		varVal.setTime(ms);
		
		return varVal;
	},
	
	readLongString: function(ba) {
		return ba.readUTFBytes(ba.readUnsignedInt());
	},
	
	readXML: function(ba) {
		var strXML = ba.readUTFBytes(ba.readUnsignedInt());
		return new XML(strXML);
	},
	
	/**
	 * If a strongly typed object has an alias registered for its class then the type name 
	 * will also be serialized. Typed objects are considered complex types and reoccurring 
	 * instances can be sent by reference.
	 */
	readCustomClass: function(ba) {
		var classID = ba.readUTF();
		var obj = this.readObject(ba);
		
		// Try to type it to the class def
		/*try {
			var classDef:Class = getClassByAlias(classID);
			obj = new classDef();
			obj.readExternal(ba);
		} catch (e) {
			obj = this.readData(ba);
		}*/
		
		return obj;
	}
};

}});