/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
	"firebug/lib/dom",
	"firebug/lib/domplate",
	"firebug/lib/options",
	"firebug/lib/locale",
	"firebug/lib/xpcom",
    "firebug/lib/trace",
	"flashbug/lib/mm",
	"flashbug/lib/io"
],
function(Obj, Dom, Domplate, Options, Locale, Xpcom, FBTrace, MM, IO) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;
var panelName = "flashConsole";
var arrPattern = [
	{ label:"xml", 				pattern:new RegExp("^(@@XML@@|@@HTML@@)[^<]*")},
	{ label:"error", 			pattern:new RegExp("^(@@ERROR@@)\s*")},
	{ label:"subError", 		pattern:/^\s*at/},
	{ label:"nativeError", 		pattern:new RegExp("^Error\s+")},
	{ label:"nativeError", 		pattern:new RegExp("^(Error|EvalError|RangeError|ReferenceError|SyntaxError|TypeError|URIError):\s*")}, // ECMAScript core Error classes
	{ label:"nativeError", 		pattern:new RegExp("^(ArgumentError|SecurityError|VerifyError):\s*")}, // ActionScript core Error classes
	{ label:"nativeError", 		pattern:new RegExp("^(EOFError|IllegalOperationerror|IOError|MemoryError|ScriptTimeoutError|StackOverflowError|DRMManagerError|SQLError|SQLErrorOperation|VideoError|InvalidSWFError):\s*")}, // flash.error package Error classes
	{ label:"nativeError", 		pattern:new RegExp("^(AutomationError|CollectionViewError|Conflict|ConstraintError|CursorError|DataServiceError|DefinitionError|Fault|InvalidCategoryError|InvalidFilterError):\s*")}, // Flex package Error classes
	{ label:"nativeError", 		pattern:new RegExp("^(ItemPendingError|MessagingError|NoDataAvailableError|PersistenceError|SortError|VideoError|SOAPFault):\s*")}, // Flex package Error classes pt2
	{ label:"nativeError", 		pattern:new RegExp("^(PersistenceError|ProxyServiceError|SyncManagerError):\s*")}, // Coldfusion Error classes
	{ label:"nativeError", 		pattern:/^\[RPC\sFault\s+/}, // Coldfusion Error Event
	{ label:"nativeError", 		pattern:new RegExp("^(UnresolvedConflictsError):\s*")}, // LiveCycle Data Services Error classes
	{ label:"sandboxError", 	pattern:/^\*{3}\sSecurity\sSandbox\sViolation\s\*{3}/},
	{ label:"sandboxSubError",	pattern:new RegExp("^SecurityDomain\s*")},
	{ label:"warning", 			pattern:new RegExp("^(@@WARNING@@|warning)\s*")},
	{ label:"nativeWarning",	pattern:new RegExp("^(Warning):\s*")},
	{ label:"info", 			pattern:new RegExp("^(@@INFO@@|Info|info):?\s*")}
];
var regexXMLStart = /^<(?!XML)([a-z][\w0-9-]*)>/i;
var regexXMLEnd = /<\/(?!XML)([a-z][\w0-9-]*)>$/i;
var regexXML = /^<(?!XML)([a-z][\w0-9-]*)>.*<\/(?!XML)([a-z][\w0-9-]*)>$/i;

Locale.registerStringBundle("chrome://flashbug/locale/flashbug.properties");

// ********************************************************************************************* //
// Custom Module Implementation

var trace = function(msg, obj) {
		if (FBTrace.DBG_FLASH_CONSOLE) FBTrace.sysout('flashbug; ConsoleModule - ' + msg, obj);
	},
	ERROR = function(e) {
		 if (FBTrace.DBG_FLASH_ERRORS) FBTrace.sysout('flashbug; ERROR ' + e);
	};
	
Flashbug.ConsoleModule = Obj.extend(Firebug.ActivableModule, {
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
	// Firebug Module Override

    initialize: function(context, doc) {
		trace("initialize");
		Firebug.ActivableModule.initialize.apply(this, arguments);
		
		this.description = Locale.$STR("flashbug.logPanel.description");
		this.dispatchName = Locale.$STR("flashbug.logPanel.title");
		
        //Firebug.ActivableModule.initialize.apply(this, arguments);

        // Moved SharedObject to separate Panel, if SharedObject was a selected Tab change it to Trace
		if(Options.get("flashbug.console.defaultTab").toLowerCase() == "cookie") Options.set("flashbug.console.defaultTab", "trace");
		//
		
		this.selectedReader = this.traceReader;
    },
	
	initializeNode: function(panelNode) {
		trace('initializeNode');
		Firebug.ActivableModule.initializeNode.apply(this, arguments);
	},
	
	shutdown: function() {
		trace("shutdown");
        Firebug.ActivableModule.shutdown.apply(this, arguments);
    },
	
	showPanel: function(browser, panel) {
		trace("showPanel " + browser, panel);
        var isFlashPanel = panel && panel.name == panelName;
        Dom.collapse(Firebug.chrome.$("fbFlashbugButtons"), !isFlashPanel);
        Dom.collapse(Firebug.chrome.$("fbFlashbugVersion"), !isFlashPanel);
		
		if (isFlashPanel) {
			// Init Readers
			var doc = panel ? panel.document : null;
			if(!this.traceReader.divLog) this.traceReader.divLog = doc.createElement('div');
			if(!this.policyReader.divLog) this.policyReader.divLog = doc.createElement('div');
			
			this.panel = panel;
			
			// Select Log to help init panel
			this.onSelectLog(null, Options.get("flashbug.console.defaultTab"), panel);
		}
    },
	
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
	// Flashbug Specific

    defTimeout: 50,
	timeout: 50,
	readTimer: Xpcom.CCIN('@mozilla.org/timer;1', 'nsITimer'),
	traceReader: {name:"Trace", divLog:null, paused:false, lastModifiedTime:null, fileSize:-1, arrText:[], arrTextDiff:[], arrTextPrevLength:0},
	policyReader: {name:"Policy", divLog:null, paused:false, lastModifiedTime:null, fileSize:-1, arrText:[], arrTextDiff:[], arrTextPrevLength:0},
	selectedReader: null,
	description: 'flashbug.logPanel.description',
	dispatchName: 'flashbug.logPanel.title',
	panel:null, 

	onClear: function(context) {
		trace("onClear");
		
		var panel = context.getPanel(panelName, true);
		
		// Flush File
		var file = this.selectedReader.name == "Trace" ? MM.logFile : MM.policyFile;
		var result = IO.writeFile(file);
		if (result != true) alert(Locale.$STR("flashbug.logPanel.error.flush"), Locale.$STR('flashbug.logPanel.error.title'));
		
		// Invalidate
		this.selectedReader.lastModifiedTime = null;
		this.selectedReader.fileSize = -1;
		this.selectedReader.arrTextDiff = [];
		this.selectedReader.arrTextPrevLength = 0;
		
		if(panel) {
			this.selectedReader.divLog = panel.document.createElement('div');
			Dom.clearNode(panel.selectedNode);
			panel.refresh();
		}
    },
	
	onPause: function(context, panel) {
		trace("onPause");
		
		this.selectedReader.paused = true;
		this.readTimer.cancel();
	},
	
	onPlay: function(context, panel) {
		trace("onPlay");
		
		// Play if 
		this.selectedReader.paused = false;
		this.readTimer.cancel();
		var t = this;
		this.readTimer.initWithCallback({ notify:function(timer) { t.readFile(); } }, this.timeout, Ci.nsITimer.TYPE_ONE_SHOT);
	},
	
	onOpen: function(context) {
		var file = this.selectedReader.name == "Trace" ? MM.logFile : MM.policyFile;
		trace("onOpen: " + file.path, file);
		IO.launchFile(file);
	},
	
	onSelectLog: function(context, view, panel) {
		trace("onSelectLog - " + view);
		Options.set("flashbug.console.defaultTab", view.toLowerCase());
		
		this.selectedReader = this[Options.get("flashbug.console.defaultTab") + "Reader"];
		
		// Quick display file data
		var modified = this.readFile();
		if (!modified) this.displayValues();
		
		// Pause/Play
		if(this.selectedReader.paused) {
			this.onPause(context);
		} else {
			this.onPlay(context);
		}
		
		panel = panel || context.getPanel(panelName, true);
		if(panel) {
			panel.showLog();
			panel.refresh();
		}
    },
	
	readFile: function() {
		if (typeof Flashbug == 'undefined') return null;
		//trace("readFile " + this.selectedReader.name, this);
		
		// Read the file
		var cis = Xpcom.CCIN("@mozilla.org/intl/converter-input-stream;1", "nsIConverterInputStream"),
			hasmore,
			line = {},
			modified = false,
			file = this.selectedReader.name == "Trace" ? MM.logFile : MM.policyFile;
		try {
			// If file has changed since last read
			if(this.selectedReader.lastModifiedTime != file.lastModifiedTime || this.selectedReader.fileSize != file.fileSize) {		
				modified = true;
				this.selectedReader.arrText = [];
				this.selectedReader.lastModifiedTime = file.lastModifiedTime;
				this.selectedReader.fileSize = file.fileSize;
				
				// Read File
				var fis = Xpcom.CCIN("@mozilla.org/network/file-input-stream;1", "nsIFileInputStream");
				fis.init(file, 0x01, 4, null);
				cis.init(fis, Options.get("flashbug.console.charSet"), 1024, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
				if(cis instanceof Ci.nsIUnicharLineInputStream) {
					var firstLine = true;
					do {
						hasmore = cis.readLine(line);
						if(firstLine && line.value == "") continue;
						this.selectedReader.arrText.push(line.value);
						firstLine = false;
					} while (hasmore);
					
					cis.close();
				}
				fis.close();
			}
		} catch(e) {
			// maybe select tab?
			alert(Locale.$STR("flashbug.logPanel.error.read") + e);
			this.selectedReader.paused = true;
		}
		
		//trace("read file modified:" + modified + " PrevLength:" + this.selectedReader.arrTextPrevLength + " NewLength:" + this.selectedReader.arrText.length);
		
		this.selectedReader.arrTextDiff = (this.selectedReader.arrTextPrevLength > 0) ? this.selectedReader.arrText.slice(this.selectedReader.arrTextPrevLength) : this.selectedReader.arrText.slice();
		//trace("read file diff", this.selectedReader.arrTextDiff);
		this.selectedReader.arrTextPrevLength = this.selectedReader.arrText.length;
		
		// Display contents
		if (modified) this.displayValues();
		
		// If playing
		this.readTimer.cancel();
		if(!this.selectedReader.paused) {
			this.timeout = modified ? this.defTimeout : 1000;
			var t = this;
			this.readTimer.initWithCallback({ notify:function(timer) { t.readFile(); } }, this.timeout, Ci.nsITimer.TYPE_ONE_SHOT);
		}
		
		return modified;
	},
	
	displayValues: function() {
		if(!this.panel) return;
		
		trace("displayValues " + this.selectedReader.name, this);
		
		var text = '', 
			startElement = null,
			matchResult = {label:''}, 
			hasChanged = false,
			maxLines = Options.get('flashbug.console.maxLines'),
			i = 0, 
			l = this.selectedReader.arrTextDiff.length, 
			className = '',
			docFrag = this.panel.document.createDocumentFragment(),
			strXML = '';
		
		// Copied from XMLViewer // 
		// Override getHidden in these templates. The parsed XML document is
        // hidden, but we want to display it using 'visible' styling.
        var templates = [
            Firebug.HTMLPanel.CompleteElement,
            Firebug.HTMLPanel.Element,
            Firebug.HTMLPanel.TextElement,
            Firebug.HTMLPanel.EmptyElement,
            Firebug.HTMLPanel.XEmptyElement,
        ];
		
        var originals = [];
        for (var i = 0; i < templates.length; i++) {
            originals[i] = templates[i].getHidden;
            templates[i].getHidden = function() { return ''; }
        }
		//
		
		i = 0;
		while (i < l) {
			text = this.selectedReader.arrTextDiff[i];
			
			// Remove double spaces from AIR
			// BUG: Doesn't work, but works in Flex
			//text = text.replace(/\x0D$/gm, '');
			
			i++;
			
			// Limit lines drawn
			if(i > maxLines && maxLines > 0) break;
			
			hasChanged = true;
			
			// Concact initial multiline xml strings
			if(text.match(/^@@XML@@\s*</gm) && strXML == '') {
				text = text.replace(arrPattern[0].pattern, '');
				var xmlElement = regexXML.exec(text);
				startElement = null;
				
				// Is this a single xml line?
				if (xmlElement[2] == xmlElement[1]) {
					// Yup, handle it like a single
				} else {
					startElement = xmlElement[1];
					strXML += text;
					continue;
				}
			}
			
			// Concat multiline xml strings 
			if(text.match(/^\s*</gm) && strXML != '') {
				strXML += text;
				
				// If this is the last line and we're still reading XML, assume this is the end
				if(i == l) {
					startElement = null;
					text = strXML;
					text = text.replace(/>[\s\t\r\n]*</g, '><');
					strXML = '';
				} else {
					var endElement = regexXMLEnd.exec(text);
					if (endElement && endElement[1] == startElement) {
						// End of multiline xml
						startElement = null;
						text = strXML;
						text = text.replace(/>[\s\t\r\n]*</g, '><');
						strXML = '';
					} else {
						continue;
					}
				}
			}
			
			// Concat multiline xml strings, blank string (AIR app)
			else if(strXML != '' && text.length == 0) {
				continue;
			}
			
			// End of xml, backtrack and handle as normal
			else if(strXML != '') {
				--i;
				startElement = null;
				text = strXML;
				text = text.replace(/>[\s\t\r\n]*</g, '><');
				strXML = '';
			}
			
			// Grab pattern that matches trace
			matchResult = this.matchPattern(text);
			
			className = 'flb-trace-row';
			switch(matchResult.label) {
				case 'error' :
					text = text.replace(matchResult.pattern, '');
				case 'nativeError' :
				case 'sandboxError' :
					className += ' flb-trace-error-icon';
				case 'subError' :

				case 'sandboxSubError' :
					className += ' flb-trace-error';
					break;
				case 'warning' :
					text = text.replace(matchResult.pattern, '');
				case 'nativeWarning' :
					className += ' flb-trace-warning';
					break;
				case 'info' :
					className += ' flb-trace-info';
					text = text.replace(matchResult.pattern, '');
					break; 
				case 'xml' :
					text = text.replace(matchResult.pattern, '');
					break; 
			}
			
			var div = this.panel.document.createElement('div');
			
			// Auto parse JSON
			try {
				if (text.indexOf('[') != 0 && text.indexOf('{') != 0) throw 'Simple data, just display 1';
				
				text = JSON.parse(text);
				Firebug.DOMPanel.DirTable.tag.replace({object: text, toggles: {}}, div);
				div.setAttribute('class', 'flb-trace-row');
			} catch(err) {
				// Auto parse XML
				if (text.match(regexXMLStart) != null) {
					// Parse response and create DOM.
					var parser = Xpcom.CCIN('@mozilla.org/xmlextras/domparser;1', 'nsIDOMParser');
					var doc = parser.parseFromString(text, 'text/xml');
					var root = doc.documentElement;
					
					// Error handling
					var nsURI = 'http://www.mozilla.org/newlayout/xml/parsererror.xml';
					if (root.namespaceURI == nsURI && root.nodeName == 'parsererror') {
						trace('xml error - "' + text + '"');
						Flashbug.ConsoleModule.XMLErrorRep.tag.replace({error: {
						message: root.firstChild.nodeValue + ' [' + text + ']',
						source: root.lastChild.textContent
						}}, div);
					} else {
						trace('xml - "' + text + '"', root);
						Firebug.HTMLPanel.CompleteElement.tag.replace({object: root}, div);
						div.setAttribute('class', 'flb-trace-row');
					}
				} else {
					
					// Grab URLs
					text = text.replace('<', '&lt;', 'g');
					text = text.replace('>', '&gt;', 'g');
					text = text.replace('&quot;', '"', 'g');
					text = text.replace(/(\s*)((\w+:\/\/)([-\w\.]+)+(:\d+)?(\/([\w\/_\-\.]*(\?[^\s\/"]+)?)?)?)/ig, "$1<span title='$2' class='flb-link' >$2</span>");
					
					div.innerHTML = text;
					div.setAttribute('class', className);
				}
			}
			
			docFrag.appendChild(div);
		}
		
		// Copied from XMLViewer // 
		for (var i=0; i<originals.length; i++) {
            templates[i].getHidden = originals[i];
		}
		//
		
		// Add rows
		if(hasChanged) {
			this.selectedReader.divLog.appendChild(docFrag);
			
			// If node is displayed & Auto scroll
			if (Options.get("flashbug.console.autoScroll")) this.panel.refresh();
		}
		
		// Prevent pause/play from adding the same content
		this.selectedReader.arrTextDiff = [];
	},
	
	matchPattern: function(line) {
		//trace('matchPattern');
		var i = arrPattern.length, pattern;
		while (i--) {
			pattern = arrPattern[i];
			try {
				if(line.match(pattern['pattern']) != null) {
					return {label: pattern['label'], pattern: pattern['pattern']};
				}
			} catch(e) {
				ERROR(Locale.$STR('flashbug.logPanel.error.match') + e);
			}
		}
		return {label:'', pattern:''};
	}
});

// ********************************************************************************************* //
// DOMPlate Implementation

with (Domplate) {
	Flashbug.ConsoleModule.XMLErrorRep = domplate(Firebug.Rep, {
		tag:
			DIV({class: "flb-trace-row"},
				DIV({class: "flb-trace-error-xml"}, "$error.message"),
				PRE({class: "flb-trace-error-xml-source"}, "$error.source")
			)
	});
	
	Flashbug.ConsoleModule.BodyRep = domplate(Firebug.Rep, {
		tag:
			DIV({class: "flb-trace-panel"},
				DIV({class: "flb-trace-info-trace-text flb-trace-text"}),
				DIV({class: "flb-trace-info-policy-text flb-trace-text"}),
				DIV({class: "flb-trace-disabled"},
					Locale.$STR("flashbug.logPanel.cleared")
				)
			)
	});
};

return Flashbug.ConsoleModule;
});