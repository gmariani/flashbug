FBL.ns(function() { with (FBL) {
	
/*
uint8 - BYTE - readUnsignedByte - U8
int8 - CHAR - readByte
uint16 - USHORT - readUnsignedShort - U16
int16 - SHORT - readShort
uint32 - ULONG - readUnsignedInt - U32
int32 - LONG - readInt

readBoolean : moves position by 1
readByte : moves position by 1
readDouble : moves position by 8
readFloat : moves position by 4
readInt : moves position by 4
readMultiByte : Reads a multibyte string of specified length from the file stream, byte stream
readShort : moves position by 2
readUnsignedByte : moves position by 1
readUnsignedInt : moves position by 4
readUnsignedShort : moves position by 2
readUTF : reads based on assumed prefix of string length
readUTFBytes : moves specified amount
*/

if (typeof FBTrace == "undefined") FBTrace = { };

var trace = function(msg) {
	if (FBTrace.DBG_FLASH_AMF3) {
		if (typeof FBTrace.sysout == "undefined") {
			alert(msg);
		} else {
			FBTrace.sysout(msg);
		}
	}
};

// AbstractMessage Serialization Constants
const HAS_NEXT_FLAG = 128;
const BODY_FLAG = 1;
const CLIENT_ID_FLAG = 2;
const DESTINATION_FLAG = 4;
const HEADERS_FLAG = 8;
const MESSAGE_ID_FLAG = 16;
const TIMESTAMP_FLAG = 32;
const TIME_TO_LIVE_FLAG = 64;
const CLIENT_ID_BYTES_FLAG = 1;
const MESSAGE_ID_BYTES_FLAG = 2;

//AsyncMessage Serialization Constants
const CORRELATION_ID_FLAG = 1;
const CORRELATION_ID_BYTES_FLAG = 2;

// CommandMessage Serialization Constants
const OPERATION_FLAG = 1;

// Simplified implementaiton of the class alias registry 
var classAliasRegistry = {	
	"DSK": "flex.messaging.messages.AcknowledgeMessageExt",
	"DSA": "flex.messaging.messages.AsyncMessageExt",
	"DSC": "flex.messaging.messages.CommandMessageExt"	
};

Flashbug.AMF3 = function() {
	
	//--------------------------------------
	//  Public Vars
	//--------------------------------------
	
	//--------------------------------------
	//  Private Vars
	//--------------------------------------

	// The raw binary data
	this._rawData = null;
	
	// The decoded data
	this._data = null;
	
	this.arrObjCache = [];
	this.arrStrCache = [];
	this.arrDefCache = [];
	
	//--------------------------------------
	//  Constructor
	//--------------------------------------
	
};

Flashbug.AMF3.prototype = {
	
	// Reads the amf3 data
	deserialize: function(data) {
		this.clearCache();
		
		this._rawData = data;
		this._data = this.readData(this._rawData);
	},
	
	// Clears the object, string and definition cache
	clearCache: function() {
		this.arrObjCache = [];
		this.arrStrCache = [];
		this.arrDefCache = [];
	},
	
	readData: function(ba) {
		var type = ba.readByte();
		switch(type) {
			case 0x00 : return undefined;  				// Undefined
			case 0x01 : return null;					// Null
			case 0x02 : return false;					// Boolean false
			case 0x03 : return true;					// Boolean true
			case 0x04 : return this.readInt(ba);		// Integer
			case 0x05 : return this.readDouble(ba);		// Double
			case 0x06 : return this.readString(ba);		// String
			case 0x07 : return this.readXMLDoc(ba);		// XML Doc
			case 0x08 : return this.readDate(ba);		// Date
			case 0x09 : return this.readArray(ba);		// Array
			case 0x0A : return this.readObject(ba);		// Object
			case 0x0B : return this.readXML(ba); 		// XML
			case 0x0C : return this.readByteArray(ba); 	// Byte Array
			default: throw Error("AMF3::readData - Error : Undefined AMF3 type encountered '" + type + "'");
		}
	},
	
	readInt: function(ba) {
		var count = 0;
		var intRef = ba.readUnsignedByte();
		var result = 0;
		
		while ((intRef & 0x80) != 0 && count < 3) {
			result <<= 7;
			result |= (intRef & 0x7f);
			intRef = ba.readUnsignedByte();
			count++;
		}
		
		if (count < 3) {
			result <<= 7;
			result |= intRef;
		} else {
			// Use all 8 bits from the 4th byte
			result <<= 8;
			result |= intRef;
			
			// Check if the integer should be negative
			if ((result & 0x10000000) != 0) {
				// and extend the sign bit
				result |= 0xe0000000;
			}
		}
		
		return result;
	},
	
	readDouble: function(ba) {
		return ba.readDouble();
	},
	
	readString: function(ba) {
		var handle = this.readInt(ba);
		var str = "";
		
		// Is this referring to a previous string?
		if ((handle & 0x01) == 0) {
			handle = handle >> 1;
			if (handle >= this.arrStrCache.length) {
				throw Error("AMF3::readString - Error : Undefined string reference '" + handle + "'");
				return null;
			}
			return this.arrStrCache[handle];
		}
		
		var len = handle >> 1; 
		if (len > 0) {
			str = ba.readUTFBytes(len);
			this.arrStrCache.push(str);
		}
		
		return str;
	},
	
	readXMLDoc: function(ba) {
		var handle = this.readInt(ba);
		var xmldoc;
		var inline = ((handle & 1)  != 0 );
		handle = handle >> 1;
		
		if(inline) {
			xmldoc = new XML(ba.readUTFBytes(handle));
			this.arrObjCache.push(xmldoc);
		} else {
			xmldoc = this.arrObjCache[handle];
		}
		
		return xmldoc;
	},
	
	readDate: function(ba) {
		var handle = this.readInt(ba);
		var inline = ((handle & 1)  != 0 );
		handle >>= 1;
		
		// Is this referring to a previous date?
		if (inline) {
			var varVal = new Date();
			varVal.setTime(ba.readDouble());
			this.arrObjCache.push(varVal);
			return varVal;
		} else {
			if (handle >= this.arrObjCache.length) {
				ERROR("AMF3::readDate - Error : Undefined date reference '" + handle + "'");
				return null;
			}
			return this.arrObjCache[handle];
		}
	},
	
	readArray: function(ba) {
		var handle = this.readInt(ba);
		var inline = ((handle & 1)  != 0 );
		handle = handle >> 1;
		
		if (inline) {
			var arr = [];
			var strKey = this.readString(ba);
			
			while(strKey != "") {
				arr[strKey] = this.readData(ba);
				strKey = this.readString(ba);
			}
			
			for(var i = 0; i < handle; i++) {
				arr[i] = this.readData(ba);
			}
			
			this.arrObjCache.push(arr);
			return arr;
		} else {
			// return previously reference array
			return this.arrObjCache[handle];
		}
	},
	
	/**
	 * A single AMF 3 type handles ActionScript Objects and custom user classes. The term 'traits' 
	 * is used to describe the defining characteristics of a class. In addition to 'anonymous' objects 
	 * and 'typed' objects, ActionScript 3.0 introduces two further traits to describe how objects are 
	 * serialized, namely 'dynamic' and 'externalizable'.
	 * 
	 * Anonymous : an instance of the actual ActionScript Object type or an instance of a Class without 
	 * a registered alias (that will be treated like an Object on deserialization)
	 * 
	 * Typed : an instance of a Class with a registered alias
	 * 
	 * Dynamic : an instance of a Class definition with the dynamic trait declared; public variable members 
	 * can be added and removed from instances dynamically at runtime
	 * 
	 * Externalizable : an instance of a Class that implements flash.utils.IExternalizable and completely 
	 * controls the serialization of its members (no property names are included in the trait information).
	 * 
	 * @param	ba
	 * @return
	 */
	readObject: function(ba) {
		var handle = this.readInt(ba);
		var inline = (handle & 0x01) != 0;
		handle = handle >> 1;
		var classDefinition;
		var classMemberDefinitions;
		
		if(inline) {
			// An inline object
			var inlineClassDef = (handle & 0x01) != 0;
			handle = handle >> 1;
			if (inlineClassDef) {
				// Inline class-def
				var typeIdentifier = this.readString(ba);
				
				// Flags that identify the way the object is serialized/deserialized
				var externalizable = (handle & 0x01) != 0;
				handle = handle >> 1;
				
				var isDynamic = (handle & 0x01) != 0;
				handle = handle >> 1;
				
				var classMemberCount = handle;
				classMemberDefinitions = [];
				for(var i = 0; i < classMemberCount; i++) {
					classMemberDefinitions.push(this.readString(ba));
				}
				
				classDefinition = {type:typeIdentifier, members:classMemberDefinitions, externalizable:externalizable, dynamic:isDynamic};
				this.arrDefCache.push(classDefinition);
			} else {
				// A reference to a previously passed class-def
				if (!this.arrDefCache[handle]) throw new Error("AMF3::readObject - Error : Unknown Definition reference: '" + handle + "'");
				classDefinition = this.arrDefCache[handle];
			}
		} else {
			// An object reference
			if (!this.arrObjCache[handle]) throw new Error("AMF3::readObject - Error : Unknown Object reference: '" + handle + "'");
			return this.arrObjCache[handle];
		}
		
		var obj = {};
		
		// Check for any registered class aliases 
		var aliasedClass = classAliasRegistry[classDefinition.type];
		if (aliasedClass != null) classDefinition.type = aliasedClass;
		
		//Add to references as circular references may search for this object
		this.arrObjCache.push(obj);
		
		if (classDefinition.externalizable) {
			try {
				if (classDefinition.type.indexOf("flex.") == 0) {
					// Try to get a class
					var classParts = classDefinition.type.split(".");
					var unqualifiedClassName = classParts[(classParts.length - 1)];
					if (unqualifiedClassName && Flashbug.flex[unqualifiedClassName]) {
						var flexParser = new Flashbug.flex[unqualifiedClassName]();
						obj = flexParser.readExternal(ba, this);
					} else {
						obj = this.readData(ba);
					}
				}
			} catch (e) {
				ERROR("AMF3::readObject - Error : Unable to read externalizable data type '" + classDefinition.type + "'  -  " + e);
				obj = "Unable to read externalizable data type '" + classDefinition.type + "'";
			}
		} else {
			var l = classDefinition.members.length;
			var key;
			
			for(var j = 0; j < l; j++) {
				var val = this.readData(ba);
				key = classDefinition.members[j];
				obj[key] = val;
			}
			
			if(classDefinition.dynamic/* && obj is ASObject*/) {
				key = this.readString(ba);
				while(key != "") {
					var value = this.readData(ba);
					obj[key] = value;
					key = this.readString(ba);
				}
			}
		}
		
		if(classDefinition.type) obj._className = classDefinition.type;
		
		return obj;
	},
	
	readXML: function(ba) {
		var handle = this.readInt(ba);
		var xml;
		var inline = ((handle & 1)  != 0 );
		handle = handle >> 1;
		
		if(inline) {
			xml = new XML(ba.readUTFBytes(handle));
			this.arrObjCache[handle] = xml;
		} else {
			xml = this.arrObjCache[handle];
		}
		
		return xml;
	},
	
	readByteArray: function(ba) {
		var handle = this.readInt(ba);
		var inline = ((handle & 1) != 0 );
		var ba2 = [];
		handle = handle >> 1;
		
		if(inline) {
			//ba2 = new ByteArray();
			while(handle--) {
				ba2.push("0x" + ba.readByte().toString(16).toUpperCase());
			}
			//ba.readBytes(ba2, 0, handle);
			this.arrObjCache[handle] = ba2;
		} else {
			ba2 = this.arrObjCache[handle];
		}
		
		return ba2;
	}
};

//////////////////////
// Remoting Classes //
//////////////////////

Flashbug.flex = {};

// Abstract Message //
Flashbug.flex.AbstractMessage = function() {
	this.clientId = null; // object
	this.destination = null; // string
	this.messageId = null; // string
	this.timestamp = null; // number
	this.timeToLive = null; // number
	
	this.headers = null; // Map
	this.body = null; // object
	
	//this.clientIdBytes; // byte array
	//this.messageIdBytes; // byte array
};

Flashbug.flex.AbstractMessage.prototype = {
	
	readExternal: function(ba, parser) {
		var flagsArray = this.readFlags(ba);
		for (var i = 0; i < flagsArray.length; i++) {
			var flags = flagsArray[i],
			reservedPosition = 0;
			
			if (i == 0) {
				if ((flags & BODY_FLAG) != 0) this.readExternalBody(ba, parser);
				if ((flags & CLIENT_ID_FLAG) != 0) this.clientId = parser.readData(ba);
				if ((flags & DESTINATION_FLAG) != 0) this.destination = parser.readData(ba);
				if ((flags & HEADERS_FLAG) != 0) this.headers = parser.readData(ba);
				if ((flags & MESSAGE_ID_FLAG) != 0) this.messageId = parser.readData(ba);
				if ((flags & TIMESTAMP_FLAG) != 0) this.timestamp = parser.readData(ba);
				if ((flags & TIME_TO_LIVE_FLAG) != 0) this.timeToLive = parser.readData(ba);
				reservedPosition = 7;
			} else if (i == 1) {
				if ((flags & CLIENT_ID_BYTES_FLAG) != 0) {
					//var clientIdBytes = parser.readData(ba);
					//this.clientId = UUIDUtils.fromByteArray(clientIdBytes);
					this.clientId = parser.readData(ba);
				}
				
				if ((flags & MESSAGE_ID_BYTES_FLAG) != 0) {
					//var messageIdBytes = parser.readData(ba);
					//this.messageId = UUIDUtils.fromByteArray(messageIdBytes);
					this.messageId = parser.readData(ba);
				}
				
				reservedPosition = 2;
			}
			
			// For forwards compatibility, read in any other flagged objects to
			// preserve the integrity of the input stream...
			if ((flags >> reservedPosition) != 0) {
				for (var j = reservedPosition; j < 6; j++) {
					if (((flags >> j) & 1) != 0) parser.readData(ba);
				}
			}
		}
		
		return this;
	},
	
	readExternalBody: function(ba, parser) {
		this.body = parser.readData(ba);
	},
	
	readFlags: function(ba) {
		var hasNextFlag = true, 
		flagsArray = [], 
		i = 0;
		
		while (hasNextFlag) {
			var flags = ba.readUnsignedByte();
			/*if (i == flagsArray.length) {
				short[] tempArray = new short[i*2];
				System.arraycopy(flagsArray, 0, tempArray, 0, flagsArray.length);
				flagsArray = tempArray;
			}*/
			
			flagsArray[i] = flags;
			hasNextFlag = ((flags & HAS_NEXT_FLAG) != 0) ? true : false;
			i++;
		}
		
		return flagsArray;
	}
};

// Async Message //
Flashbug.flex.AsyncMessage = function() {
	this.correlationId = null; // string
	//var correlationIdBytes; // byte array
};
Flashbug.flex.AsyncMessage.prototype = new Flashbug.flex.AbstractMessage();
Flashbug.flex.AsyncMessage.constructor = Flashbug.flex.AsyncMessage;

Flashbug.flex.AsyncMessage.prototype.readExternal = function(ba, parser) {
	Flashbug.flex.AbstractMessage.prototype.readExternal.call(this, ba, parser);
	
	var flagsArray = this.readFlags(ba);
	for (var i = 0; i < flagsArray.length; i++) {
		var flags = flagsArray[i],
		reservedPosition = 0;
		
		if (i == 0) {
			if ((flags & CORRELATION_ID_FLAG) != 0) this.correlationId = parser.readData(ba);
			
			if ((flags & CORRELATION_ID_BYTES_FLAG) != 0) {
				//var correlationIdBytes = parser.readData(ba);
				//correlationId = UUIDUtils.fromByteArray(correlationIdBytes);
				this.correlationId = parser.readData(ba);
			}
			
			reservedPosition = 2;
		}
		
		// For forwards compatibility, read in any other flagged objects
		// to preserve the integrity of the input stream...
		if ((flags >> reservedPosition) != 0) {
			for (var j = reservedPosition; j < 6; j++) {
				if (((flags >> j) & 1) != 0) parser.readData(ba);
			}
		}
	}
	
	return this;
};

// Async Message Ext //
Flashbug.flex.AsyncMessageExt = function() { };
Flashbug.flex.AsyncMessageExt.prototype = new Flashbug.flex.AsyncMessage();
Flashbug.flex.AsyncMessageExt.constructor = Flashbug.flex.AsyncMessageExt;

// Acknowledge Message //
Flashbug.flex.AcknowledgeMessage = function() { };
Flashbug.flex.AcknowledgeMessage.prototype = new Flashbug.flex.AsyncMessage();
Flashbug.flex.AcknowledgeMessage.constructor = Flashbug.flex.AcknowledgeMessage;

Flashbug.flex.AcknowledgeMessage.prototype.readExternal = function(ba, parser) {
	Flashbug.flex.AsyncMessage.prototype.readExternal.call(this, ba, parser);
	
	var flagsArray = this.readFlags(ba);
	for (var i = 0; i < flagsArray.length; i++) {
		var flags = flagsArray[i],
		reservedPosition = 0;
		
		// For forwards compatibility, read in any other flagged objects
		// to preserve the integrity of the input stream...
		if ((flags >> reservedPosition) != 0) {
			for (var j = reservedPosition; j < 6; j++) {
				if (((flags >> j) & 1) != 0) parser.readData(ba);
			}
		}
	}
	
	return this;
};

// Acknowledge Message Ext //
Flashbug.flex.AcknowledgeMessageExt = function() { };
Flashbug.flex.AcknowledgeMessageExt.prototype = new Flashbug.flex.AcknowledgeMessage();
Flashbug.flex.AcknowledgeMessageExt.constructor = Flashbug.flex.AcknowledgeMessageExt;

// Command Message //
Flashbug.flex.CommandMessage = function() {
	this.operation = 1000;
	this.operationName = "unknown";
};
Flashbug.flex.CommandMessage.prototype = new Flashbug.flex.AsyncMessage();
Flashbug.flex.CommandMessage.constructor = Flashbug.flex.CommandMessage;

Flashbug.flex.CommandMessage.prototype.readExternal = function(ba, parser) {
	Flashbug.flex.AsyncMessage.prototype.readExternal.call(this, ba, parser);
	
	var flagsArray = this.readFlags(ba);
	for (var i = 0; i < flagsArray.length; i++) {
		var flags = flagsArray[i],
		reservedPosition = 0,
		operationNames = [
			"subscribe", "unsubscribe", "poll", "unused3", "client_sync", "client_ping",
			"unused6", "cluster_request", "login", "logout", "subscription_invalidate",
			"multi_subscribe", "disconnect", "trigger_connect"
		];
		
		if (i == 0) {
			if ((flags & OPERATION_FLAG) != 0) {
				this.operation = parser.readData(ba);
				if (this.operation < 0 || this.operation >= operationNames.length) {
					this.operationName = "invalid." + operation + "";
				} else {
					this.operationName = operationNames[operation];
				}
			}
			reservedPosition = 1;
		}
		
		// For forwards compatibility, read in any other flagged objects
		// to preserve the integrity of the input stream...
		if ((flags >> reservedPosition) != 0) {
			for (var j = reservedPosition; j < 6; j++) {
				if (((flags >> j) & 1) != 0) parser.readData(ba);
			}
		}
	}
	
	return this;
};

// Command Message Ext //
Flashbug.flex.CommandMessageExt = function() { };
Flashbug.flex.CommandMessageExt.prototype = new Flashbug.flex.CommandMessage();
Flashbug.flex.CommandMessageExt.constructor = Flashbug.flex.CommandMessageExt;

// Error Message //
Flashbug.flex.ErrorMessage = function() { };
Flashbug.flex.ErrorMessage.prototype = new Flashbug.flex.AcknowledgeMessage();
Flashbug.flex.ErrorMessage.constructor = Flashbug.flex.ErrorMessage;

// Array Collection //
Flashbug.flex.ArrayCollection = function() {
	this.source = null;
};

Flashbug.flex.ArrayCollection.prototype.readExternal = function(ba, parser) {
	this.source = parser.readData(ba);
	return this;
};

// Array List //
Flashbug.flex.ArrayList = function() { };
Flashbug.flex.ArrayList.prototype = new Flashbug.flex.ArrayCollection();
Flashbug.flex.ArrayList.constructor = Flashbug.flex.ArrayList;

// Object Proxy //
Flashbug.flex.ObjectProxy = function() { };
Flashbug.flex.ObjectProxy.prototype.readExternal = function(ba, parser) {
	var obj = parser.readData(ba);
	for (var i in obj) {
		this[i] = obj[i];
	}
	return this;
};

// Managed Object Proxy //
Flashbug.flex.ManagedObjectProxy = function() { };
Flashbug.flex.ManagedObjectProxy.prototype = new Flashbug.flex.ObjectProxy();
Flashbug.flex.ManagedObjectProxy.constructor = Flashbug.flex.ManagedObjectProxy;

// Serialization Proxy //
Flashbug.flex.SerializationProxy = function() {
	this.defaultInstance = null;
};

Flashbug.flex.SerializationProxy.prototype.readExternal = function(ba, parser) {
	/*var saveObjectTable = null;
	var saveTraitsTable = null;
	var saveStringTable = null;
	var in3 = null;

	if (ba instanceof Amf3Input) in3 = ba;*/

	try {
		/*if (in3 != null) {
			saveObjectTable = in3.saveObjectTable();
			saveTraitsTable = in3.saveTraitsTable();
			saveStringTable = in3.saveStringTable();
		}*/
		
		this.defaultInstance = parser.readData(ba);
	} finally {
		/*if (in3 != null) {
			in3.restoreObjectTable(saveObjectTable);
			in3.restoreTraitsTable(saveTraitsTable);
			in3.restoreStringTable(saveStringTable);
		}*/
	}
	
	return this;
};

}});