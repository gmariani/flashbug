// Check if Flash Player Trust File needs to be created
//if(!Flashbug.checkTrustFile()) Flashbug.saveTrustFile();

FBL.ns(function() { with (FBL) {

// Constants
const panelName = "flbConsole";
const arrPattern = [
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
const regexXMLStart = /^<(?!XML)([a-z][\w0-9-]*)>/i;
const regexXMLEnd = /<\/(?!XML)([a-z][\w0-9-]*)>$/i;
const regexXML = /^<(?!XML)([a-z][\w0-9-]*)>.*<\/(?!XML)([a-z][\w0-9-]*)>$/i;

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;

// Localization
//-----------------------------------------------------------------------------

// Extend string bundle with new strings for this extension.
// This must be done yet before domplate definitions.
Firebug.registerStringBundle("chrome://flashbug/locale/flashbug.properties");

var $FL_STR = Flashbug.$FL_STR,
	$FL_STRF = Flashbug.$FL_STRF;

// Module Implementation
//-----------------------------------------------------------------------------

Flashbug.ConsoleModule = extend(Firebug.ActivableModule, {
	
	//////////////////////////////////////////////////////////////////////////////////////////////
	// Flash Console Module                                                                     //
	//////////////////////////////////////////////////////////////////////////////////////////////
	
	trace: function(msg, obj) {
		msg = "Flashbug - Model::" + msg;
		if (FBTrace.DBG_FLASH_CONSOLE_MODEL) {
			if (typeof FBTrace.sysout == "undefined") {
				Flashbug.alert(msg + " | " + obj);
			} else {
				FBTrace.sysout(msg, obj);
			}
		}
	},
	
	/////////////////////////////
	// Firebug Module Override //
	/////////////////////////////
	
	// Called when the window is opened.
	initialize: function() {
		this.trace("initialize");
		
		// Moved SharedObject to seperate Panel, if SharedObject was a selected Tab change it to Trace
		if(Firebug.getPref(Firebug.prefDomain, "flashbug.defaultTab").toLowerCase() == "cookie") {
			Firebug.setPref(Firebug.prefDomain, "flashbug.defaultTab", "trace");
		}
		//
		
		this.selectedReader = this.traceReader;
	},
	
	internationalizeUI: function(doc) {
		this.trace("internationalizeUI");
        var elements = ["flbClear", "flbOpen", "flashbugLogFilter-trace", "flashbugLogFilter-policy",  "fbFlashbugVersion", "fbFlashbugDownload", "flbVersion"];
        var attributes = ["label", "tooltiptext", "value"];
		
		Flashbug.internationalizeElements(doc, elements, attributes);
    },
	
	/**
     * Peforms clean up when Firebug is destroyed.
     * Called by the framework when Firebug is closed for an existing Firefox window.
     */
    shutdown: function() {
		//
    },
	
    showPanel: function(browser, panel) {
		this.trace("showPanel " + panelName, panel);
		
        var isFlashPanel = panel && panel.name == panelName;
        collapse(Firebug.chrome.$("fbFlashbugButtons"), !isFlashPanel);
        collapse(Firebug.chrome.$("fbFlashbugVersion"), !isFlashPanel);
		
		if (isFlashPanel) {
			// Append CSS
			var doc = panel.document;
			if (!$("flashbugStyles", doc)) {
				var styleSheet = createStyleSheet(doc, "chrome://flashbug/skin/flashbug.css");
				styleSheet.setAttribute("id", "flashbugStyles");
				addStyleSheet(doc, styleSheet);
			}
			
			// Init Readers
			var doc = panel ? panel.document : null;
			if(!this.traceReader.divLog) this.traceReader.divLog = doc.createElement('div');
			if(!this.policyReader.divLog) this.policyReader.divLog = doc.createElement('div');
			
			this.panel = panel;
			
			// Select Log to help init panel
			this.onSelectLog(null, Firebug.getPref(Firebug.prefDomain, "flashbug.defaultTab"), panel);
			this.displayValues();
		}
    },
	
	////////////////////////////
	// Flash Console Specific //
	////////////////////////////
	
	defTimeout: 50,
	timeout: 50,
	readTimer: CCIN('@mozilla.org/timer;1', 'nsITimer'),
	traceReader: {name:"Trace", divLog:null, paused:false, lastModifiedTime:null, fileSize:-1, arrText:[], arrTextDiff:[], arrTextPrevLength:0},
	policyReader: {name:"Policy", divLog:null, paused:false, lastModifiedTime:null, fileSize:-1, arrText:[], arrTextDiff:[], arrTextPrevLength:0},
	selectedReader: null,
	description: $FL_STR("flashbug.logPanel.description"),
	dispatchName: $FL_STR("flashbug.logPanel.title"),
	panel:null, 

	onClear: function(context) {
		this.trace("onClear");
		
		var panel = context.getPanel(panelName, true);
		
		// Flush File
		var file = this.selectedReader.name == "Trace" ? Flashbug.logFile : Flashbug.policyFile;
		var result = Flashbug.writeFile(file);
		if(result != true) Flashbug.alert($FL_STR("flashbug.logPanel.error.flush"), $FL_STR('flashbug.logPanel.error.title'));
		
		// Invalidate
		this.selectedReader.lastModifiedTime = null;
		this.selectedReader.fileSize = -1;
		this.selectedReader.arrTextDiff = [];
		this.selectedReader.arrTextPrevLength = 0;
		
		if(panel) {
			this.selectedReader.divLog = panel.document.createElement('div');
			clearNode(panel.selectedNode);
			panel.refresh();
		}
    },
	
	onPause: function(context, panel) {
		this.trace("onPause");
		
		this.selectedReader.paused = true;
		this.readTimer.cancel();
	},
	
	onPlay: function(context, panel) {
		this.trace("onPlay");
		
		// Play if 
		this.selectedReader.paused = false;
		this.readTimer.cancel();
		var t = this;
		this.readTimer.initWithCallback({ notify:function(timer) { t.readFile(); } }, this.timeout, Ci.nsITimer.TYPE_ONE_SHOT);
	},
	
	onOpen: function(context) {
		var file = this.selectedReader.name == "Trace" ? Flashbug.logFile : Flashbug.policyFile;
		this.trace("onOpen: " + file.path, file);
		Flashbug.launchFile(file);
	},
	
	onSelectLog: function(context, view, panel) {
		//this.trace("onSelectLog - " + view);
		Firebug.setPref(Firebug.prefDomain, "flashbug.defaultTab", view.toLowerCase());
		
		this.selectedReader = this[Firebug.getPref(Firebug.prefDomain, "flashbug.defaultTab") + "Reader"];
		
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
		//this.trace("readFile " + this.selectedReader.name, this);
		
		// Read the file
		var cis = CCIN("@mozilla.org/intl/converter-input-stream;1", "nsIConverterInputStream");
		var hasmore;
		var line = {};
		var modified = false;
		var file = this.selectedReader.name == "Trace" ? Flashbug.logFile : Flashbug.policyFile;
		try {
			// If file has changed since last read
			if(this.selectedReader.lastModifiedTime != file.lastModifiedTime || this.selectedReader.fileSize != file.fileSize) {		
				modified = true;
				this.selectedReader.arrText = [];
				this.selectedReader.lastModifiedTime = file.lastModifiedTime;
				this.selectedReader.fileSize = file.fileSize;
				
				// Read File
				var fis = CCIN("@mozilla.org/network/file-input-stream;1", "nsIFileInputStream");
				fis.init(file, 0x01, 4, null);
				cis.init(fis, Firebug.getPref(Firebug.prefDomain, "flashbug.charSet"), 1024, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
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
			Flashbug.alert($FL_STR("flashbug.logPanel.error.read") + e);
			this.selectedReader.paused = true;
		}
		
		this.trace("read file modified:" + modified + " PrevLength:" + this.selectedReader.arrTextPrevLength + " NewLength:" + this.selectedReader.arrText.length);
		
		this.selectedReader.arrTextDiff = (this.selectedReader.arrTextPrevLength > 0) ? this.selectedReader.arrText.slice(this.selectedReader.arrTextPrevLength) : this.selectedReader.arrText.slice();
		//this.trace("read file diff", this.selectedReader.arrTextDiff);
		this.selectedReader.arrTextPrevLength = this.selectedReader.arrText.length;
		
		// Display contents
		if(modified) this.displayValues();
		
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
		
		this.trace("displayValues " + this.selectedReader.name, this);
		
		var text = '', 
		startElement = null,
		matchResult = {label:''}, 
		hasChanged = false,
		maxLines = Firebug.getPref(Firebug.prefDomain, 'flashbug.maxLines'),
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
					var parser = CCIN('@mozilla.org/xmlextras/domparser;1', 'nsIDOMParser');
					var doc = parser.parseFromString(text, 'text/xml');
					var root = doc.documentElement;
					
					// Error handling
					var nsURI = 'http://www.mozilla.org/newlayout/xml/parsererror.xml';
					if (root.namespaceURI == nsURI && root.nodeName == 'parsererror') {
						this.trace('xml error - "' + text + '"');
						Flashbug.ConsoleModule.XMLError.tag.replace({error: {
						message: root.firstChild.nodeValue + ' [' + text + ']',
						source: root.lastChild.textContent
						}}, div);
					} else {
						this.trace('xml - "' + text + '"', root);
						Firebug.HTMLPanel.CompleteElement.tag.replace({object: root}, div);
						div.setAttribute('class', 'flb-trace-row');
					}
				} else {
					
					// Grab URLs
					text = text.replace('<', '&lt;', 'g');
					text = text.replace('>', '&gt;', 'g');
					text = text.replace('&quot;', '"', 'g');
					//text = text.replace(/(\s*)((\w+:\/\/)([-\w\.]+)+(:\d+)?(\/([\w\/_\-\.]*(\?[^\s\/"]+)?)?)?)/ig, "$1<span title='$2' class='flb-link' >$2</span>");
					text = text.replace(/((?:([A-Za-z]+):)(\/{0,3})([0-9.\-A-Za-z]+)(?::(\d+))?(?:\/([^?#\s]*))?(?:\?([^#\s]*))?(?:#(.*))?)/ig, "<span title='$1' class='flb-link' >$1</span>");
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
			if(Firebug.getPref(Firebug.prefDomain, "flashbug.autoScroll")) {
				this.panel.refresh();
			}
		}
		
		// Prevent pause/play from adding the same content
		this.selectedReader.arrTextDiff = [];
	},
	
	matchPattern: function(line) {
		//this.trace('matchPattern');
		var i = arrPattern.length, pattern;
		while (i--) {
			pattern = arrPattern[i];
			try {
				if(line.match(pattern['pattern']) != null) {
					return {label: pattern['label'], pattern: pattern['pattern']};
				}
			} catch(e) {
				ERROR($FL_STR('flashbug.logPanel.error.match') + e);
			}
		}
		return {label:'', pattern:''};
	}
});

// DOMPlate Implementation
//-----------------------------------------------------------------------------

Flashbug.ConsoleModule.Rep = domplate(Firebug.Rep, {
	inspectable: false,
	
    getContextMenuItems: function(cookie, target, context) {
        var popup = $("fbContextMenu");
        if (popup.firstChild && popup.firstChild.getAttribute("command") == "cmd_copy") popup.removeChild(popup.firstChild);
    }
});

Flashbug.ConsoleModule.XMLError = domplate(Flashbug.ConsoleModule.Rep, {
	inspectable: false,
	
	tag:
        DIV({class: "flb-trace-row"},
            DIV({class: "flb-trace-error-xml"}, "$error.message"),
            PRE({class: "flb-trace-error-xml-source"}, "$error.source")
        )
});

Flashbug.ConsoleModule.PanelDiv = domplate(Flashbug.ConsoleModule.Rep, {
	inspectable: false,
	
	tag:
        DIV({class: "flb-trace-panel"},
            DIV({class: "flb-trace-info-trace-text flb-trace-text"}),
            DIV({class: "flb-trace-info-policy-text flb-trace-text"}),
            DIV({class: "flb-trace-disabled"},
				$FL_STR("flashbug.logPanel.cleared")
			)
        )
});


// Panel Implementation
//-----------------------------------------------------------------------------

function ConsolePanel() { }
ConsolePanel.prototype = extend(Firebug.ActivablePanel, {
    
	//////////////////////////////////////////////////////////////////////////////////////////////
	// Shared Objects Panel                                                                     //
	//////////////////////////////////////////////////////////////////////////////////////////////
	
	trace: function(msg, obj) {
		msg = "Flashbug - Panel::" + msg;
		if (FBTrace.DBG_FLASH_CONSOLE_PANEL) {
			if (typeof FBTrace.sysout == "undefined") {
				Flashbug.alert(msg + " | " + obj);
			} else {
				FBTrace.sysout(msg, obj);
			}
		}
	},
	
	////////////////////////////
	// Firebug Panel Override //
	////////////////////////////
	
	searchable: true,
	editable: false,
	breakable: true,
	
	// Called at the end of module.initialize; addEventListener-s here
	initializeNode: function(panelNode) {
		this.trace("initializeNode");
		
		// Add Divs
		Flashbug.ConsoleModule.PanelDiv.tag.replace({}, this.panelNode, this);
		this.traceNode = this.panelNode.getElementsByClassName("flb-trace-info-trace-text")[0];
		this.policyNode = this.panelNode.getElementsByClassName("flb-trace-info-policy-text")[0];
		
		// Select Log just so selectedNode is populated
		this.showLog();
		
		this.showVersion();
	},
	
	// this is how a panel in one window reappears in another window; lazy called
	reattach: function(doc) {
		this.trace("reattach");
		
		this.showVersion();
		this.refresh();
		
		Firebug.ActivablePanel.reattach.apply(this, arguments);
	},
	
	refresh: function() {
		this.trace("refresh");
		
		// Set the tooltips and update break-on-next button's state.
        var shouldBreak = this.shouldBreakOnNext();
        Firebug.Breakpoint.updateBreakOnNextState(this, shouldBreak);
        Firebug.Breakpoint.updateBreakOnNextTooltips(this);
        Firebug.Breakpoint.updatePanelTab(this, shouldBreak);
		
		// Get node associated with reader
		var selectedReader = Flashbug.ConsoleModule.selectedReader;
		var node = (selectedReader.name == "Trace") ? this.traceNode : this.policyNode;
		
		// Populate Node
		node.innerHTML = "";
		node.appendChild(selectedReader.divLog);
		
		// If node is displayed & Auto scroll
		if(node == this.selectedNode && Firebug.getPref(Firebug.prefDomain, "flashbug.autoScroll")) {
			scrollToBottom(this.panelNode);
		}
	},
	
	// The panel was disabled so, show the disabled page. 
	// This page also replaces the old content so, the panel is fresh empty after it's enabled again.
	show: function(state) {
		this.trace("show");
		
		// Show Player Version
		this.showToolbarButtons("fbFlashbugVersion", true);
		
		// Open last/default tab
		if(Firebug.getPref(Firebug.prefDomain, "flashbug.defaultTab") == "trace") {
			Firebug.chrome.$("flashbugLogFilter-trace").checked = true;
		} else {
			Firebug.chrome.$("flashbugLogFilter-policy").checked = true;
		}
		
		this.refresh();
	},
	
	// store info on state for next show.
	hide: function(state) {
		this.trace("hide");
		
		// Hide Player Version
		this.showToolbarButtons("fbFlashbugVersion", false);
	},
	
	/*
     * Called by chrome.onContextMenu to build the context menu when this panel has focus.
     * See also FirebugRep for a similar function also called by onContextMenu
     * Extensions may monkey patch and chain off this call
     * @param object: the 'realObject', a model value, eg a DOM property
     * @param target: the HTML element clicked on.
     * @return an array of menu items.
     */
	getContextMenuItems: function(object, target, context) {
		this.trace("getContextMenuItems");
        
		// Remove default 'Copy' command
        var popup = $("fbContextMenu");
        if (popup.firstChild && popup.firstChild.getAttribute("command") == "cmd_copy") popup.removeChild(popup.firstChild);
		
		var items = [];
		if(target.className == "flb-link") {
			var url = target.textContent;
			items.push({label: $FL_STR("flashbug.contextMenu.copyLocation"), nol10n: true, command: bindFixed(copyToClipboard, FBL, url) });
			items.push({label: $FL_STR("flashbug.contextMenu.openTab"), nol10n: true, command: bindFixed(openNewTab, FBL, url) });
		} else {
			items.push({label: $FL_STR("flashbug.contextMenu.copy"), nol10n: true, command: bindFixed(copyToClipboard, FBL, target.textContent) });
		}
		
        return items;
    },
	
	// Called when "Options" clicked. Return array of
    // {label: 'name', nol10n: true,  type: "checkbox", checked: <value>, command:function to set <value>}
	// function optionMenu(label, option, tooltiptext)
	getOptionsMenuItems: function(context) {
		this.trace("getOptionsMenuItems");
		return [
			{
				label: $FL_STR("flashbug.options.autoscroll"),
				type: "checkbox",
				checked: Firebug.getPref(Firebug.prefDomain, "flashbug.autoScroll"),
				option: "flashbug.autoScroll",
				tooltiptext: $FL_STR("flashbug.options.autoscrollToolTip"),
				command: bindFixed(Firebug.setPref, Firebug, Firebug.prefDomain, "flashbug.autoScroll", !Firebug.getPref(Firebug.prefDomain, "flashbug.autoScroll"))
			},
			"-",
			{
				label: $FL_STR("flashbug.options.pref"),
				command: function() {
					context.chrome.window.openDialog("chrome://flashbug/content/preferences.xul", "flashbugPreferences", "chrome,titlebar,toolbar,centerscreen,modal");
				}
			}
		];
    },
	
	getSearchOptionsMenuItems: function() {
		return [
			Firebug.Search.searchOptionMenu("search.Case Sensitive", "searchCaseSensitive"),
			//Firebug.Search.searchOptionMenu("search.Use Regular Expression", "searchUseRegularExpression")
		];
	},
	
	search: function(text, reverse) {
		this.trace("search - text:" + text + " reverse:" + reverse);
		
		if (!text) {
            delete this.currentSearch;
            return false;
        }
		
        var row;
        if (this.currentSearch && text == this.currentSearch.text) {
            row = this.currentSearch.findNext(true, false, reverse, Firebug.Search.isCaseSensitive(text));
        } else {
            this.currentSearch = new LogPanelSearch(this);
            row = this.currentSearch.find(text, reverse, Firebug.Search.isCaseSensitive(text));
        }
		
        if (row) {
            var sel = this.document.defaultView.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.currentSearch.range);
			
            scrollIntoCenterView(row, this.panelNode);
			setClassTimed(row, "jumpHighlight", this.context);
            return true;
        } else {
            return false;
        }
    },
	
	getBreakOnNextTooltip: function(enable) {
		if(enable) {
			return $FL_STR("flashbug.logPanel.toolbar.play");
		} else {
			return $FL_STR("flashbug.logPanel.toolbar.pause");
		}
	},
	
	breakOnNext: function(armed) {
		if(armed) {
			Flashbug.ConsoleModule.onPause(null, this);
		} else {
			Flashbug.ConsoleModule.onPlay(null, this);
		}
	},
	
	shouldBreakOnNext: function() {
		return Flashbug.ConsoleModule.selectedReader.paused;
	},
	
	////////////////////////////
	// Flash Console Specific //
	////////////////////////////
	
	name: panelName,
    title: $FL_STR("flashbug.logPanel.title"),
	traceNode: null,
	policyNode: null,
	selectedNode: null,
	order: 70,
	
	showLog: function() {
		this.trace("showLog - " + Firebug.getPref(Firebug.prefDomain, "flashbug.defaultTab"));
		
		if(this.selectedNode) this.selectedNode.removeAttribute("selected");
		this.selectedNode = getChildByClass(this.panelNode.firstChild, "flb-trace-info-" + Firebug.getPref(Firebug.prefDomain, "flashbug.defaultTab").toLowerCase() + "-text");
		this.selectedNode.setAttribute("selected", "true");
		
		// So search doesn't freeze when switching logs
		delete this.currentSearch;
	},
	
	showVersion: function() {
		var version = Flashbug.playerVersion;
		this.trace("showVersion : '" + version + "'");
		
		// If we know for sure they have the debugger, hide link
		if(version.indexOf("Debug") != -1) Firebug.chrome.$("fbFlashbugDownload").style.display = 'none';
		
		Firebug.chrome.$("flbVersion").value = version;
	}
});

////////////////////
// Firebug Search //
////////////////////
// Copied from net.js
var LogPanelSearch = function(panel, rowFinder) {
	var panelNode = panel.panelNode;
	var doc = panelNode.ownerDocument;
	var searchRange, startPt;
	Flashbug.trace("panelNode", panelNode);
	Flashbug.trace("doc", doc);

	// Common search object methods.
	this.find = function(text, reverse, caseSensitive) {
		this.text = text;
		
		finder.findBackwards = !!reverse;
		finder.caseSensitive = !!caseSensitive;
		
		this.currentRow = this.getFirstRow();
		this.resetRange();
		
		return this.findNext(false, false, reverse, caseSensitive);
	};

	this.findNext = function(wrapAround, sameNode, reverse, caseSensitive) {
		while (this.currentRow) {
			var match = this.findNextInRange(reverse, caseSensitive);
			if (match) return match;
			
			// Here is where they used regex to test if the response body has the text
			
			this.currentRow = this.getNextRow(wrapAround, reverse);
			
			if (this.currentRow) this.resetRange();
		}
		
		return null;
	};

	// Internal search helpers.
	this.findNextInRange = function(reverse, caseSensitive) {
		if (this.range) {
			startPt = doc.createRange();
			if (reverse) {
				startPt.setStartBefore(this.currentNode);
			} else {
				startPt.setStart(this.currentNode, this.range.endOffset);
			}
			
			this.range = finder.Find(this.text, searchRange, startPt, searchRange);
			if (this.range) {
				this.currentNode = this.range ? this.range.startContainer : null;
				return this.currentNode ? this.currentNode.parentNode : null;
			}
		}
		
		if (this.currentNode) {
			startPt = doc.createRange();
			if (reverse) {
				startPt.setStartBefore(this.currentNode);
			} else {
				startPt.setStartAfter(this.currentNode);
			}
		}
		
		this.range = finder.Find(this.text, searchRange, startPt, searchRange);
		this.currentNode = this.range ? this.range.startContainer : null;
		return this.currentNode ? this.currentNode.parentNode : null;
	},

	// Helpers
	this.resetRange = function() {
		searchRange = doc.createRange();
		searchRange.setStart(this.currentRow, 0);
		searchRange.setEnd(this.currentRow, this.currentRow.childNodes.length);
		
		startPt = searchRange;
	}

	this.getFirstRow = function() {
		var selectedReader = Flashbug.ConsoleModule.selectedReader;
		var node = (selectedReader.name == "Trace") ? panel.traceNode : panel.policyNode;
		return node.firstChild;
	}

	this.getNextRow = function(wrapAround, reverse) {
		// xxxHonza: reverse searching missing.
		for (var sib = this.currentRow.nextSibling; sib; sib = sib.nextSibling) {
			if (hasClass(sib, "flb-trace-row")) {
				return sib;
			}
		}
		
		return wrapAround ? this.getFirstRow() : null;
	}
};

//////////////////////////
// Firebug Registration //
//////////////////////////
Firebug.ConsoleModule = Flashbug.ConsoleModule;
Firebug.registerActivableModule(Flashbug.ConsoleModule);
Firebug.registerPanel(ConsolePanel);

/////////////////////////////
// Firebug Trace Constants //
/////////////////////////////

FBTrace.DBG_FLASH = 				Firebug.getPref(Firebug.prefDomain, "DBG_FLASH");
FBTrace.DBG_FLASH_CONSOLE_PANEL = 	Firebug.getPref(Firebug.prefDomain, "DBG_FLASH_CONSOLE_PANEL");
FBTrace.DBG_FLASH_CONSOLE_MODEL = 	Firebug.getPref(Firebug.prefDomain, "DBG_FLASH_CONSOLE_MODEL");

}});