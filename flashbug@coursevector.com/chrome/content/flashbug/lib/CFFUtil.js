/**
 * Parse CFF files to extract the font name
 */
Flashbug.CFFUtil = function (ba) {

	var strOTTO = ba.readString(4), // OTTO signature
		objData = {};
	
	// Populate Offset Table
	ba.position = 0;
	objData.offSetTable = getOffSetTable(ba);

	// Populate Directory
	objData.tables = [];
	for(var i = 0; i < objData.offSetTable.numTables; i++) {
		objData.tables.push(getDirectoryTable(ba));
	}
	
	// Populate Tables
	var l = objData.tables.length;
	for (var j = 0; j < l; j++) {
		var curTable = objData.tables[j];
		if (curTable.name == 'CFF ') {
			// Read CFF table
			ba.position = curTable.offSet;
			curTable.header = getCFFTableHeader(ba);
			curTable.names = [];
			
			var count = ba.readUI16();
			var offSize = ba.readUI8();
			var offSet = [];
			for (var k = 0; k <= count; k++) {
				offSet.push(ba.readNumber(offSize));
			}
			
			var nPos = ba.position;
			for (var k = 0; k < count; k++) {
				ba.position = nPos + (offSet[k] - 1);
				var len = offSet[k + 1] - offSet[k];
				var data = ba.readString(len);
				curTable.names.push(data);
			}
			break;
		}
	}
	
	function getCFFTableHeader(ba) {
		var obj = {};
		obj.major = ba.readUI8(); // Format major version (starting at 1) 
		obj.minor = ba.readUI8(); // Format minor version (starting at 0)
		obj.hdrSize = ba.readUI8(); // Header size (byteS)
		obj.offSize = ba.readUI8(); // Absolute offset (0) size
		return obj;
	}

	function getOffSetTable(ba) {
		var obj = {};
		obj.majorVersion = ba.readUI16();
		obj.minorVersion = ba.readUI16();
		obj.numTables = ba.readUI16();
		obj.searchRange = ba.readUI16();
		obj.entrySelector = ba.readUI16();
		obj.rangeShift = ba.readUI16();
		return obj;
	}
	
	function getDirectoryTable(ba) {
		var obj = {};
		obj.name = ba.readUTFBytes(4); //table name
		obj.checkSum = ba.readUI32(); //Check sum
		obj.offSet = ba.readUI32(); //Offset from beginning of file
		obj.length = ba.readUI32(); //length of the table in bytes
		return obj;
	}
	
	this.getFontName = function() {
		var l = objData.tables.length;
		for (var j = 0; j < l; j++) {
			var curTable = objData.tables[j];
			if (curTable.name == 'CFF ') return curTable.names[0];
		}
		
		return '';
	}
};