FBL.ns(function() { with (FBL) {

if (typeof FBTrace == "undefined") FBTrace = { };

var trace = function(msg) {
	msg = "Flashbug - SOLReader::" + msg;
	if (FBTrace.DBG_FLASH_SOL) {
		if (typeof FBTrace.sysout == "undefined") {
			alert(msg);
		} else {
			FBTrace.sysout(msg);
		}
	}
};

// When using Chromebug it can't find these from lib.js
if(!Cc || !Ci) {
	const Cc = Components.classes;
	const Ci = Components.interfaces;
}
	
Flashbug.SOLReader = function(name, nodeContent, pnlFlashbug) {
	
	//--------------------------------------
	//  Public Vars
	//--------------------------------------
	
	this.name = name;
	this.node = nodeContent;
	this.panel = pnlFlashbug;
	this.selected = false;
	
	//--------------------------------------
	//  Private Vars
	//--------------------------------------
	
	this._context;
	this._amf0 = new Flashbug.AMF0();
	this._amf3 = new Flashbug.AMF3();
	this._files = [];
	this._sols = [];
	
	//--------------------------------------
	//  Constructor
	//--------------------------------------
	
	// Grab first sub directory since they are randomly named
	var dir = Flashbug.getSharedObjectDirectory();
	var entries = dir.directoryEntries;
	var entry;
	while(entries.hasMoreElements()) {
		entry = entries.getNext();
		entry.QueryInterface(Components.interfaces.nsIFile);
		if(entry.isDirectory()) break;
	}
	this._dir = entry;
	
	trace("constructor");
};

Flashbug.SOLReader.prototype = {
	
	// Called when the panel refresh() is called
	initContext: function(panel, context) {
		trace("initContext");
		this.node = getElementByClass(panel.panelNode, "flashbugInfo" + this.name + "Text");
		this.panel = panel;
		this._context = context;
		
		this.refresh();
	},
	
	// Gets all shared objects for each domain
	getSharedObjectsFiles: function() {
		trace("getSharedObjectsFiles");
		var arrFiles = [];
		for (var key in this._context.solDomains) {
			var dir2 = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
			dir2.initWithPath(this._dir.path);
			dir2.append(this._context.solDomains[key]);
			this.getFiles(arrFiles, dir2);
		}
		
		return arrFiles;
	},
	
	// Recursively runs through all folders searching for files
	getFiles: function(arrFiles, dir) {
		trace("getFiles");
		if(dir.exists()) {
			var entries = dir.directoryEntries;
			while(entries.hasMoreElements()) {
				var entry = entries.getNext();
				entry.QueryInterface(Ci.nsIFile);
				if(entry.isDirectory()) {
					this.getFiles(arrFiles, entry);
				} else if(entry.isFile()) {
					arrFiles.push(entry);
				}
			}
		}
	},
	
	// Actually parse the files and display them to the panel
	refresh: function() {
		trace("refresh");
		
		// Do we have access to the context, if so, parse
		if(this._context && this._context.solDomains) {
			this._files = this.getSharedObjectsFiles();
		} else {
			return;
		}
		
		// Parse Files
		this._sols = [];
		if(this._files) {
			for (var i = 0; i < this._files.length; ++i) {
				try {
					var is = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
					is.init(this._files[i], -1, -1, false);
					var ba = new Flashbug.ByteArray(is);
					var data = this.deserialize(ba);
					ba.close();
					data.fileSize = this._files[i].fileSize;
					data.fullPath = this._files[i].path;
					data.swf = this._files[i].parent.leafName;
					data.path = this._files[i].path.replace(this._dir.path, "");
					data.path = data.path.replace(this._files[i].leafName, "");
					this._sols.push(data);
				} catch (e) {
					ERROR(e);
				}
			}
		}
		
		// Create cookie list table.
        Firebug.FlashbugModel.CookieTable.createTable(this.node);
		
		// Generate HTML list of cookies using domplate.
        if (this._sols.length) {
            var header = getElementByClass(this.node, "cookieHeaderRow");
            var tag = Firebug.FlashbugModel.CookieRow.cookieTag;
            var row = tag.insertRows({cookies: this._sols}, header)[0];
            for (var i = 0; i < this._sols.length; ++i) {
                var cookie = this._sols[i];
                cookie.row = row;
                row.repObject = cookie;
                row = row.nextSibling;
            }
        }
	},
	
	// Reader is selected on chrome, resume
	onSelect: function() {
		trace("onSelect");
		this.selected = true;
	},
	
	// Reader is deselected on chrome, suspend
	onDeselect: function() {
		trace("onDeselect");
		this.selected = false;
	},
	
	// Parse the individual file
	deserialize: function(ba) {
		trace("deserialize");
		var obj = { };
		this._amf0.clearCache();
		this._amf3.clearCache();
		this.readHeader(obj, ba);
		if(obj.header.amfVersion == 0 || obj.header.amfVersion == 3) this.readBody(obj, ba);
		return obj;
	},
	
	// Reads the file header
	readHeader: function(obj, ba) {
		trace("readHeader");
		var nLenFile = ba.getBytesAvailable();
		obj.header = {};
		
		// Unknown header 0x00 0xBF
		ba.readUnsignedShort();
		
		// Length of the rest of the file (filesize - 6)
		var nLenData = ba.readUnsignedInt();
		if (nLenFile != nLenData + 6) {
			throw new Error('Data Length Mismatch');
			return;
		}
		
		// Signature, 'TCSO'
		ba.readUTFBytes(4);
		
		// Unknown, 6 bytes long 0x00 0x04 0x00 0x00 0x00 0x00 0x00
		ba.readUTFBytes(6);
		
		// Read SOL Name
		obj.header.fileName = ba.readUTFBytes(ba.readUnsignedShort());
		
		// AMF Encoding
		obj.header.amfVersion = ba.readUnsignedInt();
		
		if(obj.header.amfVersion === 0 || obj.header.amfVersion === 3) {
			if(obj.header.fileName == "undefined") obj.header.fileName = "[SOL Name not Set]";
		} else {
			obj.header.fileName = "[Not yet supported sol format]";
		}
	},
	
	// Reads the file body
	readBody: function(obj, ba) {
		trace("readBody");
		obj.body = {};
		while(ba.getBytesAvailable() > 1) {
			try {
				this.readVariable(obj, ba);
			} catch(e) {
				ERROR(e);
				return;
			}
		}
	},
	
	// Reads a variable pair
	readVariable: function(obj, ba) {
		trace("readVariable");
		var varName = "";
		var varVal;
		if (obj.header.amfVersion == 3) {
			varName = this._amf3.readString(ba);
			varVal = this._amf3.readData(ba);
		} else {
			varName = ba.readUTF();
			varVal = this._amf0.readData(ba);
		}
		ba.readUnsignedByte(); // Ending byte
		obj.body[varName] = varVal;
	}
};

}});