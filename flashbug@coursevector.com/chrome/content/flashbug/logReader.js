FBL.ns(function() { with (FBL) {
	
var $FL_STR = Flashbug.$FL_STR;
var $FL_STRF = Flashbug.$FL_STRF;
var getPref = Flashbug.getPref;
var setPref = Flashbug.setPref;
var FirebugPrefDomain = "extensions.firebug"; // FirebugPrefDomain is not defined in 1.05.

if (typeof FBTrace == "undefined") FBTrace = { };

var trace = function(msg) {
	if (FBTrace.DBG_FLASH_LOG) {
		if (typeof FBTrace.sysout == "undefined") {
			alert(msg);
		} else {
			FBTrace.sysout(msg);
		}
	}
};

Flashbug.LogReader = function(name, nodeContent, pnlFlashbug) {
	
	//--------------------------------------
	//  Public Vars
	//--------------------------------------
	
	this.name = name;
	this.node = nodeContent;
	this.panel = pnlFlashbug;
	this.defTimeout = 50;
	this.timeout = 50;
	this.readTimer = CCIN('@mozilla.org/timer;1', 'nsITimer');
	this.paused = false;
	this.selected = false;
	this.lastModifiedTime = null;
	this.fileSize = -1;
	this.innerHTML = "";
	this.searchFind = 0;
	this.arrText = [];
	this.arrTextDiff = [];
	this.arrTextPrevLength = 0;
	this.arrPattern = [
		{ label:"xml", 				pattern:new RegExp("^(@@XML@@|@@HTML@@)[^<]*")},
		{ label:"error", 			pattern:new RegExp("^(@@ERROR@@)\s*")},
		{ label:"subError", 		pattern:/^\s*at/g},
		{ label:"nativeError", 		pattern:new RegExp("^Error\s+")},
		{ label:"nativeError", 		pattern:new RegExp("^(Error|EvalError|RangeError|ReferenceError|SyntaxError|TypeError|URIError):\s*")}, // ECMAScript core Error classes
		{ label:"nativeError", 		pattern:new RegExp("^(ArgumentError|SecurityError|VerifyError):\s*")}, // ActionScript core Error classes
		{ label:"nativeError", 		pattern:new RegExp("^(EOFError|IllegalOperationerror|IOError|MemoryError|ScriptTimeoutError|StackOverflowError|DRMManagerError|SQLError|SQLErrorOperation|VideoError|InvalidSWFError):\s*")}, // flash.error package Error classes
		{ label:"nativeError", 		pattern:new RegExp("^(AutomationError|CollectionViewError|Conflict|ConstraintError|CursorError|DataServiceError|DefinitionError|Fault|InvalidCategoryError|InvalidFilterError):\s*")}, // Flex package Error classes
		{ label:"nativeError", 		pattern:new RegExp("^(ItemPendingError|MessagingError|NoDataAvailableError|PersistenceError|SortError|VideoError|SOAPFault):\s*")}, // Flex package Error classes pt2
		{ label:"nativeError", 		pattern:new RegExp("^(PersistenceError|ProxyServiceError|SyncManagerError):\s*")}, // Coldfusion Error classes
		{ label:"nativeError", 		pattern:/^\[RPC\sFault\s+/g}, // Coldfusion Error Event
		{ label:"nativeError", 		pattern:new RegExp("^(UnresolvedConflictsError):\s*")}, // LiveCycle Data Services Error classes
		{ label:"sandboxError", 	pattern:/^\*{3}\sSecurity\sSandbox\sViolation\s\*{3}/g},
		{ label:"sandboxSubError",	pattern:new RegExp("^SecurityDomain\s*")},
		{ label:"warning", 			pattern:new RegExp("^(@@WARNING@@|warning)\s*")},
		{ label:"nativeWarning",	pattern:new RegExp("^(Warning):\s*")},
		{ label:"info", 			pattern:new RegExp("^(@@INFO@@|Info|info):?\s*")}
	];
	
	//--------------------------------------
	//  Private Vars
	//--------------------------------------
	
	//--------------------------------------
	//  Constructor
	//--------------------------------------
	
	// Remap theses since they might be incorrect
	$FL_STR = Flashbug.$FL_STR;
	$FL_STRF = Flashbug.$FL_STRF;
	getPref = Flashbug.getPref;
	setPref = Flashbug.setPref;
	
	trace("Flashbug - LogReader(" + this.name + ")::constructor");
};

Flashbug.LogReader.prototype = {
	
	//--------------------------------------
	//  Public Methods
	//--------------------------------------
	
	// Clear log and log file
	clear: function(context) {
		trace("Flashbug - LogReader(" + this.name + ")::clear");
		clearNode(this.node);
		
		// Flush File
		var file = this.name == "Trace" ? Flashbug.getLogFile() : Flashbug.getPolicyFile();
		var result = Flashbug.writeFile(file);
		if(result != true) {
			ERROR(result);
			this.printLine($FL_STR("flashbug.flushError") + result);
		}
		
		// Invalidate
		this.lastModifiedTime = null;
		this.fileSize = -1;
		this.arrTextDiff = [];
		this.arrTextPrevLength = 0;
		
		// Print message
		trace("$FL_STR('flashbug.cleared') " + $FL_STR("flashbug.cleared") + " : " + $FL_STR);
		this.printLine($FL_STR("flashbug.cleared"));
		this.innerHTML = this.node.innerHTML;
		
		trace("Flashbug - Panel::updateScroll");
		this.panel.updateScroll();
    },
	
	// Context has changed, synchronize content between instances
	synchronize: function() {
		trace("Flashbug - LogReader(" + this.name + ")::synchronize");
		if(this.innerHTML != "") this.node.innerHTML = this.innerHTML;
		this.applySearch();
	},
	
	// Called when the panel refresh() is called
	initContext: function(panel) {
		trace("Flashbug - LogReader(" + this.name + ")::initContext");
		this.node = getElementByClass(panel.panelNode, "flashbugInfo" + this.name + "Text");
		this.panel = panel;
		this.synchronize();
	},
	
	play: function(context) {
		if(this.selected) {
			//trace("Flashbug - LogReader(" + this.name + ")::play");
			this.paused = false;
			this.readTimer.cancel();
			var t = this;
			this.readTimer.initWithCallback({ notify:function(timer) { t.readFile(); } }, this.timeout, Ci.nsITimer.TYPE_ONE_SHOT);
		}
	},
	
	pause: function(context) {
		trace("Flashbug - LogReader(" + this.name + ")::pause");
		this.paused = true;
		this.synchronize();
		this.readTimer.cancel();
	},
	
	// Reader is selected on chrome, resume
	onSelect: function() {
		this.selected = true;
		trace("Flashbug - LogReader(" + this.name + ")::onSelect");
		
		if(this.paused) {
			this.pause();
		} else {
			this.play();
		}
	},
	
	// Reader is deselected on chrome, suspend
	onDeselect: function() {
		this.selected = false;
		trace("Flashbug - LogReader(" + this.name + ")::onDeselect");
		this.readTimer.cancel();
	},
	
	replaceChars: function(ch) {
		trace("Flashbug - LogReader(" + this.name + ")::replaceChars");
		switch (ch)	{
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case "&":
				return "&amp;";
			case "'":
				return "&#39;";
			case '"':
				return "&quot;";
		}
		return "?";
	},
	
	// trace messages using rules
	displayValues: function() {
		trace("Flashbug - LogReader(" + this.name + ")::displayValues");
		var text = "", 
		matchResult = {label:""}, 
		hasXML = false,
		hasChanged = false,
		maxLines = getPref(FirebugPrefDomain, "flashbug.maxLines"),
		i = 0, 
		l = this.arrTextDiff.length, 
		className = "",
		docfrag = this.node.ownerDocument.createDocumentFragment(),
		strXML = "";
		
		while (i < l) {
			text = this.arrTextDiff[i];
			i++;
			
			// Limit lines drawn
			if(i > maxLines && maxLines > 0) break;
			
			hasChanged = true;
			
			// Concact initial multiline xml strings
			if(text.match(/^@@XML@@\s*</gm) && strXML == "") {
				strXML += text;
				continue;
			}
			
			// Concat multilie xml strings 
			if(text.match(/^\s*</gm) && strXML != "") {
				strXML += text;
				
				// If this is the last line and we're still reading XML, assume this is the end
				if(i == l) {
					text = strXML;
					text = text.replace(/>[\s\t\r\n]*</g, "><");
					strXML = "";
				} else {
					continue;
				}
			}
			
			// Concat multilie xml strings, blank string (AIR app)
			else if(strXML != "" && text.length == 0) {
				continue;
			}
			
			// End of xml, backtrack and handle as normal
			else if(strXML != "") {
				--i;
				text = strXML;
				text = text.replace(/>[\s\t\r\n]*</g, "><");
				strXML = "";
			}
			
			// Grab pattern that matches trace
			matchResult = this.matchPattern(text);
			
			className = "flashbugRow";
			switch(matchResult.label) {
				case "error" :
					text = text.replace(matchResult.pattern, "");
				case "nativeError" :
				case "sandboxError" :
					className += " flashbugRowIconError";
				case "subError" :
				case "sandboxSubError" :
					className += " flashbugRowError";
					break;
				case "warning" :
					text = text.replace(matchResult.pattern, "");
				case "nativeWarning" :
					className += " flashbugRowWarning";
					break;
				case "info" :
					className += " flashbugRowInfo";
					text = text.replace(matchResult.pattern, "");
					break; 
				case "xml" :
					className += " flashbugRowXML";
					hasXML = true;
					text = text.replace(matchResult.pattern, "");
					break; 
			}
			
			// Grab URLs
			text = text.replace(/\s+((\w+:\/\/)[-a-zA-Z0-9:@;?&=\/%\+\.\*!'\(\),\$_\{\}\^~\[\]`#|]+)/g, "__@@LT@@__span class=__@@QT@@__flashbugLink__@@QT@@__ __@@GT@@__$1__@@LT@@__/span__@@GT@@__");
			
			// Encode special characters
			text = text.replace(/[<>&"']/g, this.replaceChars);
			text = text.replace(/__@@LT@@__/g, "<");
			text = text.replace(/__@@GT@@__/g, ">");
			text = text.replace(/__@@QT@@__/g, "'");
			
			var div = this.node.ownerDocument.createElement('div');
			div.innerHTML = text;
			div.setAttribute("class", className);
			docfrag.appendChild(div);
		}
		
		// Add rows
		if(hasChanged) this.node.appendChild(docfrag);
		
		// Pretty up XML markup
		if(hasXML) {
			var xmlNodes = getElementsByClass(this.node, "flashbugRowXML");
			i = xmlNodes.length;
			while (i--) {
				var node = xmlNodes[i];
				node.className = "flashbugRow"; // So it's not found next time
				text = node.textContent;
				
				// Parse response and create DOM.
				var parser = CCIN("@mozilla.org/xmlextras/domparser;1", "nsIDOMParser");
				var doc = parser.parseFromString(text, "text/xml");
				var root = doc.documentElement;
				
				// Error handling
				var nsURI = "http://www.mozilla.org/newlayout/xml/parsererror.xml";
				if (root.namespaceURI == nsURI && root.nodeName == "parsererror") {
					Firebug.FlashbugModel.XMLError.tag.replace({error: {
					message: root.firstChild.nodeValue + " [" + text + "]",
					source: root.lastChild.textContent
					}}, node);
					continue;
				}
				
				// Generate UI using Domplate template (from HTML panel).
				Firebug.HTMLPanel.CompleteElement.tag.replace({object: root}, node);
			}
		}
		
		// Prevent pause/play from adding the same content
		this.arrTextDiff = [];
		
		// Remove highlighting
		this.removeHighlight();
		
		// Cache html before highlighting
		this.innerHTML = this.node.innerHTML;
		
		// Update Search
		this.applySearch();
		
		// Update scroll position
		if(hasChanged) this.panel.updateScroll();
	},
	
	applySearch: function() {
		trace("Flashbug - LogReader(" + this.name + ")::applySearch");
		var chrome = this.context ? this.context.chrome : FirebugChrome;
		var searchPattern = chrome.$("fbSearchBox").value;
		if(searchPattern.length > 0) this.highlight(searchPattern);
	},
	
	printLine: function(text) {
		trace("Flashbug - LogReader(" + this.name + ")::printLine");
		var div = this.node.ownerDocument.createElement('div');
		div.setAttribute("class", "flashbugRow");
		div.innerHTML = text;
		this.node.appendChild(div);
	},
	
	matchPattern: function(line) {
		trace("Flashbug - LogReader(" + this.name + ")::matchPattern");
		var i = this.arrPattern.length, pattern;
		while (i--) {
			pattern = this.arrPattern[i];
			try {
				trace(line + " : " + pattern['pattern'] + " : " + line.match(pattern['pattern']));
				if(line.match(pattern['pattern']) != null) {
					return {label: pattern['label'], pattern: pattern['pattern']};
				}
			} catch(e) {
				ERROR($FL_STR("flashbug.matchError") + e);
			}
		}
		return {label:"", pattern:""};
	},
	
	readFile: function() {
		//trace("Flashbug - LogReader(" + this.name + ")::readFile");
		// Get File
		// Read the file
		var cis = CCIN("@mozilla.org/intl/converter-input-stream;1", "nsIConverterInputStream");
		var hasmore;
		var line = {};
		var modified = false;
		var file = this.name == "Trace" ? Flashbug.getLogFile() : Flashbug.getPolicyFile();
		try {
			// If file has changed since last read
			if(this.lastModifiedTime != file.lastModifiedTime || this.fileSize != file.fileSize) {		
				modified = true;
				this.arrText = [];
				this.lastModifiedTime = file.lastModifiedTime;
				this.fileSize = file.fileSize;
				
				// Read File
				var fis = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
				fis.init(file, 0x01, 00004, null);
				cis.init(fis, getPref(FirebugPrefDomain, "flashbug.charSet"), 1024, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
				if(cis instanceof Ci.nsIUnicharLineInputStream) {
					var firstLine = true;
					do {
						hasmore = cis.readLine(line);
						if(firstLine && line.value == "") continue;
						this.arrText.push(line.value);
						firstLine = false;
					} while (hasmore);
					
					// In FireFox 2, it reads the ending blank line
					if(line.value == '') this.arrText.pop();
					
					cis.close();
				}
				fis.close();
			}
		} catch(e) {
			// print error to log
			// maybe select tab?
			this.printLine($FL_STR("flashbug.readError") + e);
			this.pause();
		}
		
		this.arrTextDiff = (this.arrTextPrevLength > 0) ? this.arrText.slice(this.arrTextPrevLength) : this.arrText.slice();
		this.arrTextPrevLength = this.arrText.length;
		
		// Display contents
		if(modified) this.displayValues();
		
		// If playing
		if(!this.paused && this.selected) {
			this.timeout = modified ? this.defTimeout : 1000;
			this.play();
		}
	},
	
	highlight: function(pat) {
		trace("Flashbug - LogReader(" + this.name + ")::highlight");
		this.searchFind = 0;
		
		var i = this.node.childNodes.length;
		while (i--) {
			this.innerHighlight(this.node.childNodes[i], pat.toUpperCase());
		}
		
		return (this.searchFind > 0) ? true : false;
	},
	
	innerHighlight: function(node, pat) {
		trace("Flashbug - LogReader(" + this.name + ")::innerHighlight");
		if (node.nodeType == 3) {
			var pos = node.data.toUpperCase().indexOf(pat);
			if (pos >= 0) {
				var spannode = node.ownerDocument.createElement('span');
				spannode.className = 'flashbugHighlight';
				var middlebit = node.splitText(pos);
				var endbit = middlebit.splitText(pat.length);
				var middleclone = middlebit.cloneNode(true);
				spannode.appendChild(middleclone);
				middlebit.parentNode.replaceChild(spannode, middlebit);
				this.searchFind++;
			}
		} else if (node.nodeType == 1 && node.childNodes && !/(script|style)/i.test(node.tagName)) {
			for (var i = 0; i < node.childNodes.length; ++i) {
				i += this.innerHighlight(node.childNodes[i], pat);
			}
		}
	},

	removeHighlight: function() {
		trace("Flashbug - LogReader(" + this.name + ")::removeHighlight");
		var highlightedNodes = getElementsByClass(this.node, "flashbugHighlight"), i = highlightedNodes.length;
		while (i--) {
			var node = highlightedNodes[i];
			node.parentNode.firstChild.nodeName;
			with (node.parentNode) {
				replaceChild(node.firstChild, node);
				normalize();
			}
		}
	}
};

}});