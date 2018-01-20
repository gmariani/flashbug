FBL.ns(function() { with (FBL) {

if (typeof FBTrace == "undefined") FBTrace = { };

var trace = function(msg) {
	if (FBTrace.DBG_FLASH_AMF) {
		if (typeof FBTrace.sysout == "undefined") {
			alert(msg);
		} else {
			FBTrace.sysout(msg);
		}
	}
};

// AMF Version Constants
const AMF0_VERSION = 0;
const AMF1_VERSION = 1; // There is no AMF1 but FMS uses it for some reason, hence special casing.
const AMF3_VERSION = 3;
	
Flashbug.AMF = function() {
	
	//--------------------------------------
	//  Public Vars
	//--------------------------------------
	
	//--------------------------------------
	//  Private Vars
	//--------------------------------------
	
	this._amf0 = new Flashbug.AMF0();
	
	//--------------------------------------
	//  Constructor
	//--------------------------------------
	
};

Flashbug.AMF.prototype = {
	
	deserialize: function(ba) {
		var obj = { };
		obj.headers = [];
		obj.bodies = [];
		
		this.readHeader(obj, ba);
		this.readBody(obj, ba);
		
		return obj;
	},
	
	/**
	 * Similar to AMF 0, AMF 3 object reference tables, object trait reference tables and string reference 
	 * tables must be reset each time a new context header or message is processed.
	 * 
	 * Note that Flash Player 9 will always set the second byte to 0×03, regardless of whether the message was sent in AMF0 or AMF3.
	 * 
	 * @param	data
	 */
	readHeader: function(obj, ba) {
		obj.version = ba.readUnsignedShort();
		switch(obj.version) {
			case AMF0_VERSION:
				obj.versionInfo = "Flash Player 8 and Below";
				break;
			case AMF1_VERSION:
				obj.versionInfo = "Flash Media Server";
				break;
			case AMF3_VERSION:
				obj.versionInfo = "Flash Player 9+";
				break;
		}
		
		if (obj.version != AMF0_VERSION && obj.version != AMF3_VERSION) {
            //Unsupported AMF version {version}.
            throw new Error("Unsupported AMF version " + obj.version);     
        }
		
		var numHeaders = ba.readUnsignedShort(); //  find the total number of header elements return
		while (numHeaders--) {
			this._amf0.clearCache();
			var name = ba.readUTF();
			var required = !!ba.readUnsignedByte(); // find the must understand flag
			var length = ba.readUnsignedInt(); // grab the length of the header element
			var content = this._amf0.readData(ba); // turn the element into real data
			
			obj.headers.push({ name:name, mustUnderstand:required, data:content }); // save the name/value into the headers array
		}
	},
	
	readBody: function(obj, ba) {
		var numBodies = ba.readUnsignedShort(); // find the total number of body elements
		while (numBodies--) {
			this._amf0.clearCache();
			var targetURI = ba.readUTF(); // When the message holds a response from a remote endpoint, the target URI specifies which method on the local client (i.e. AMF request originator) should be invoked to handle the response.
			var responseURI = ba.readUTF(); // The response's target URI is set to the request's response URI with an '/onResult' suffix to denote a success or an '/onStatus' suffix to denote a failure.
			var length = ba.readUnsignedInt(); // grab the length of the body element
			var data = this._amf0.readData(ba); // turn the element into real data
			
			obj.bodies.push({ targetURI:targetURI, responseURI:responseURI, data:data }); // add the body element to the body object
		} 
	}
};

}});