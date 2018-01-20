// Check if Flash Player Trust File needs to be created
if(!Flashbug.checkTrustFile()) Flashbug.saveTrustFile();

FBL.ns(function() { with (FBL) {

/*

1.7.3 -
Added SPL mime type
Added default locale support (uses firebug pref)
Fixed small localization bug
Aligned version data to the right
Removed extra seperator in SharedObject Panel

1.7.2 -
Updated support for Firebug 1.7

1.7.1 -
Updated support for Firefox 4
Updated version compatibility
Fixed autoscroll bug with Firefox 4
Added gradient stroke support for decompiled SWFs
Added 64x64 icon

1.7 - 
Supports Firefox 3.6+
Supports Firebug 1.6+
Updated AMF parsers to Minerva 3.2
Fixed MM.cfg creation
Fixed mm.cfg Vista location
Fixed Ubuntu trust file creation
Fixed Ubuntu trust file permissions
Removed the .DTD file, no more entity based localization
Removed legacy code

AMF Tab - Asynchronous
AMF Tab can now export the data
AMF Tab now has better error handling messages
AMF Tab now has a fix for the disappearing tab bug
AMF Tab is now split into two corresponding tabs
New SWF Tab
SWF Tab - Asynchronous
SOL Panel - Asynchronous
Log Panel - Synchronous
Log Panel now supports JSON automatically in traces (Must be a single line, no line breaks)
Log Panel now supports XML automatically in traces (Must be a single line, no line breaks)
Log Panel now has a min height for traces of blank lines.
Log Panel now has titles for links in traces
Log Panel now has a unified Search feature to blend with the native Firebug panels
New Shared Object Panel
Shared Object Panel is separated so it can be invidually enabled or disabled
Shared Object Panel now has a delete all button to remove all Shared Objects detected

Supports exportAssets
Supports symbolClass
Supports fileAttributes
Supports metadata
Supports protect
Supports setBackgroundColor
Supports productInfo

Supports defineBindaryData

Supports JPEGTables
Supports defineBits
Supports defineBitsJPEG2
Supports defineBitsJPEG3
Supports defineBitsJPEG4 (experimental - needs test)
Supports defineBitsLossless
	- 8  bit
	- 15 bit (experimental - needs test)
	- 24 bit
Supports defineBitsLossless2
	- 8  bit
	- 32 bit

Supports defineEditText
Supports defineText
Supports defineText2

Supports defineFont
Supports defineFont2
Supports defineFont3
Supports defineFont4
Supports defineFontInfo
Supports defineFontInfo2
Supports defineFontName

Supports defineShape
Supports defineShape2
Supports defineShape3
Supports defineShape4
Supports defineMorphShape
Supports defineMorphShape2 (experimental - needs test)

Supports defineSound
Supports soundStreamBlock
Supports soundStreamHead
Supports soundStreamHead2
	- Uncompressed, NE (experimental - needs test)
	- ADPCM (incomplete) **********************
	- MP3
	- Uncompressed, LE
	- Nellymoser 16 kHz (not started - don't know of a player to test with) **********************
	- Nellymoser 8 kHz (not started) **********************
	- Nellymoser (not started) **********************
	- Speex (needs test) **********************

Supports defineVideoStream
Supports videoFrame
	- Sorenson Spark (H.263)
	- Screen Video
	- On2 Truemotion VP6
	- On2 Truemotion VP6 Alpha
	- Screen Video V2 (experimental - needs test)
	- H.264 (needs test / not embeddable?) **********************
	
Unsupported:
Bitmap patterns on shapes
Morph shape animation
Speex
Nellymoser
ADPCM
Screen Video V2
H.264

1.7.1 -
// TODO: Search with regex
// TODO: Add custom amf NetPanel filter
// TODO: handle image fills
// TODO: Finish export ADPCM audio - can't figure out how to convert Flash ADPCM to normal IMA/DVI ADPCM
http://www.sonicspot.com/guide/wavefiles.html
http://blog.theroyweb.com/extracting-wav-file-header-information-using-a-python-script
// TODO: Custom filters/coloring

*/

// Constants
const panelName = "flashbug";
const SWF_MIME = "application/x-shockwave-flash";
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

// Localization
//-----------------------------------------------------------------------------

// Extend string bundle with new strings for this extension.
// This must be done yet before domplate definitions.
Firebug.registerStringBundle("chrome://flashbug/locale/flashbug.properties");

var $FL_STR = Flashbug.$FL_STR,
$FL_STRF = Flashbug.$FL_STRF;

// Module Implementation
//-----------------------------------------------------------------------------

Firebug.FlashbugModel = extend(Firebug.ActivableModule, {
	
	//////////////////////////////////////////////////////////////////////////////////////////////
	// Module                                                                                   //
	//////////////////////////////////////////////////////////////////////////////////////////////
	//{
	/**
	* Called by Firebug when Firefox window is opened.
	*/
	/*initialize: function() {
	},*/

	/**
	* Called when the UI is ready for context creation.
	* Used by chromebug; normally FrameProgressListener events trigger UI synchronization,
	* this event allows sync without progress events.
	*/
	/*initializeUI: function(detachArgs) {
	},*/

	/**
	* Called by Firebug when Firefox window is closed.
	*/
	/*shutdown: function() {
	},*/

	/**
	* Called when a new context is created but before the page is loaded.
	*/
	/*initContext: function(context, persistedState) {
	},*/

	/**
	* Called after a context is detached to a separate window;
	*/
	/*reattachContext: function(browser, context) {
	},*/

	/**
	* Called when a context is destroyed. Module may store info on persistedState for reloaded pages.
	*/
	/*destroyContext: function(context, persistedState) {
	},*/

	/**
	* Called when attaching to a window (top-level or frame).
	*/
	/*watchWindow: function(context, win) {
	},*/

	/**
	* Called when unwatching a window (top-level or frame).
	*/
	/*unwatchWindow: function(context, win) {
	},*/

	// Called when a FF tab is create or activated (user changes FF tab)
	// Called after context is created or with context == null (to abort?)
	/*showContext: function(browser, context) {
	},*/

	/**
	* Called after a context's page gets DOMContentLoaded
	*/
	/*loadedContext: function(context) {
	},*/

	/*
	* After "onSelectingPanel", a panel has been selected but is not yet visible
	*/
	/*showPanel: function(browser, panel) {
	},*/

	/*showSidePanel: function(browser, sidePanel) {
	},*/

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	/*updateOption: function(name, value) {
	},*/

	/*getObjectByURL: function(context, url) {
	},*/
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// intermodule dependency

	// caller needs module. win maybe context.window or iframe in context.window.
	// true means module is ready now, else getting ready
	/*isReadyElsePreparing: function(context, win) {
	},*/
	//}
	//////////////////////////////////////////////////////////////////////////////////////////////
	// ActivableModule                                                                          //
	//////////////////////////////////////////////////////////////////////////////////////////////
	//{
	/**
	* Every activable module is disabled by default waiting for on a panel
	* that wants to have it enabled (and display provided data). The rule is
	* if there is no panel (view) the module is disabled.
	*/
	//enabled: false,

	/**
	* List of observers (typically panels). If there is at least one observer registered
	* The module becomes active.
	*/
	//observers: null,

	/**
	* List of dependent modules.
	*/
	//dependents: null,

	/*initialize: function() {
		Firebug.Module.initialize.apply(this, arguments);
	},*/

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Observers (dependencies)

	/*hasObservers: function() {
		return this.observers ? this.observers.length > 0 : false;
	},*/

	/*addObserver: function(observer) {
		if (!this.observers) this.observers = [];
		
		this.observers.push(observer);
		this.onObserverChange(observer);  // not dispatched.
	},*/

	/*removeObserver: function(observer) {
		if (!this.observers) return;
		
		remove(this.observers, observer);
		this.onObserverChange(observer);  // not dispatched
	},*/

	/**
	* This method is called if an observer (e.g. {@link Firebug.Panel}) is added or removed.
	* The module should decide about activation/deactivation upon existence of at least one
	* observer.
	*/
	/*onObserverChange: function(observer) {
		if (FBTrace.DBG_WINDOWS) FBTrace.sysout("firebug.ActivableModule.onObserverChange;");
	},*/

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Cross module dependencies.

	/*addDependentModule: function(dependent) {
		if (!this.dependents) this.dependents = [];
		
		this.dependents.push(dependent);
		this.onDependentModuleChange(dependent);  // not dispatched.
	},*/

	/*removeDependentModule: function(dependent) {
		if (!this.dependents) return;
		
		remove(this.dependents, dependent);
		this.onDependentModuleChange(dependent);  // not dispatched
	},*/

	/*onDependentModuleChange: function(dependent) {
		if (FBTrace.DBG_WINDOWS) FBTrace.sysout("onDependentModuleChange no-op for "+dependent.dispatchName);
	},*/

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Firebug Activation

	// Called before any suspend actions. Firest caller to return true aborts suspend.
	/*onSuspendingFirebug: function() {
	},*/

	// When the number of activeContexts decreases to zero. Modules should remove listeners, disable function that takes resources
	/*onSuspendFirebug: function() {
	},*/

	// When the number of activeContexts increases from zero. Modules should undo the work done in onSuspendFirebug
	/*onResumeFirebug: function() {
	},*/

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Module enable/disable APIs.

	/*isEnabled: function() {
		return this.hasObservers();
	},*/

	/*isAlwaysEnabled: function() {
		return this.hasObservers();
	}*/
	//}
	//////////////////////////////////////////////////////////////////////////////////////////////
	// Flash Console Module                                                                     //
	//////////////////////////////////////////////////////////////////////////////////////////////
	
	trace: function(msg, obj) {
		msg = "Flashbug - Model::" + msg;
		if (FBTrace.DBG_FLASH_MODEL) {
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
		
		// Moved Cookie to seperate Panel, if Cookie was a selected Tab change it to Trace
		if(Firebug.getPref(Firebug.prefDomain, "flashbug.defaultTab").toLowerCase() == "cookie") {
			Firebug.setPref(Firebug.prefDomain, "flashbug.defaultTab", "trace");
		}
		//
		
		this.selectedReader = this.traceReader;
		
		this.initMMFile(false);
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
			
			// File was corrupted or written improperly
			if(Flashbug.getMMFile().fileSize == 0) this.initMMFile(true);
			
			// Init Readers
			if(!this.traceReader.divLog) this.traceReader.divLog = doc.createElement('div');
			if(!this.policyReader.divLog) this.policyReader.divLog = doc.createElement('div');
			
			this.panel = panel;
			
			// Select Log to help init panel
			this.onSelectLog(null, Firebug.getPref(Firebug.prefDomain, "flashbug.defaultTab"), panel);
			this.displayValues();
		}
    },
	
	/*onObserverChange: function(observer) {
		this.trace("onObserverChange - this.hasObservers() " + this.hasObservers());
		
        if (this.hasObservers()) {
			this.selectedReader.onSelect();
        } else {
			this.policyReader.onDeselect();
			this.traceReader.onDeselect();
        }
    },*/
	
	// Called when a new context is created but before the page is loaded.
	/*initContext: function(context, persistedState) {
		this.trace("initContext");
		
    },*/
	
	////////////////////////////
	// Flash Console Specific //
	////////////////////////////
	
	defTimeout: 50,
	timeout: 50,
	readTimer: CCIN('@mozilla.org/timer;1', 'nsITimer'),
	traceReader: {name:"Trace", divLog:null, paused:false, lastModifiedTime:null, fileSize:-1, arrText:[], arrTextDiff:[], arrTextPrevLength:0},
	policyReader: {name:"Policy", divLog:null, paused:false, lastModifiedTime:null, fileSize:-1, arrText:[], arrTextDiff:[], arrTextPrevLength:0},
	selectedReader: null,
	playerVersion: "",
	jsPlayerVersion: "",
	description: $FL_STR("flashbug.logPanel.description"),
	dispatchName: "Flash Console",
	panel:null, 

	onClear: function(context) {
		this.trace("onClear");
		
		var panel = context.getPanel(panelName, true);
		
		// Flush File
		var file = this.selectedReader.name == "Trace" ? Flashbug.getLogFile() : Flashbug.getPolicyFile();
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
		var file = this.selectedReader.name == "Trace" ? Flashbug.getLogFile() : Flashbug.getPolicyFile();
		this.trace("onOpen: " + file.path);
		Flashbug.launchFile(file);
	},
	
	onSelectLog: function(context, view, panel) {
		//this.trace("onSelectLog - " + view);
		Firebug.setPref(Firebug.prefDomain, "flashbug.defaultTab", view.toLowerCase());
		
		this.selectedReader = this[Firebug.getPref(Firebug.prefDomain, "flashbug.defaultTab") + "Reader"];
		
		// Quick display file data
		this.readFile();
		this.displayValues();
		
		// Pause/Play
		if(this.selectedReader.paused) {
			this.onPause(context);
		} else {
			this.onPlay(context);
		}
		
		var panel = panel ? panel : context.getPanel(panelName, true);
		if(panel) {
			panel.showLog();
			panel.refresh();
		}
    },
	
	initMMFile: function(force) {
		this.trace("initMMFile");
		var mm_exists = true,
			alertTimer = CCIN('@mozilla.org/timer;1', 'nsITimer');
		if(Flashbug.getMMFile().fileSize == 0 || force) {
			if(Flashbug.getMMDirectory().isWritable()) {
				var valEnableErrors = Firebug.getPref(Firebug.prefDomain, "flashbug.enableErrors") ? 1 : 0;
				var valEnablePolicy = Firebug.getPref(Firebug.prefDomain, "flashbug.enablePolicy") ? 1 : 0;
				var valEnablePolicyAppend = Firebug.getPref(Firebug.prefDomain, "flashbug.enablePolicyAppend") ? 1 : 0;
				var valEnableOuputBuff = Firebug.getPref(Firebug.prefDomain, "flashbug.traceOutputBuffered") ? 1 : 0;
				var valEnableVerbose = Firebug.getPref(Firebug.prefDomain, "flashbug.aS3Verbose") ? 1 : 0;
				var valEnableTrace = Firebug.getPref(Firebug.prefDomain, "flashbug.aS3Trace") ? 1 : 0;
				var valEnableStatic = Firebug.getPref(Firebug.prefDomain, "flashbug.aS3StaticProfile") ? 1 : 0;
				var valEnableDynamic = Firebug.getPref(Firebug.prefDomain, "flashbug.aS3DynamicProfile") ? 1 : 0;
				var result = Flashbug.saveMMFile(valEnableErrors, Firebug.getPref(Firebug.prefDomain, "flashbug.maxWarnings"), valEnablePolicy, valEnablePolicyAppend, valEnableOuputBuff, valEnableVerbose, valEnableTrace, valEnableStatic, valEnableDynamic);
				if(result != true) {
					this.trace("initMMFile: " + result);
					// Cannot create the Flash Player Debugger config (mm.cfg) file in
					alertTimer.initWithCallback({ notify:function(timer) { Flashbug.alert($FL_STR("flashbug.logPanel.error.mm") + Flashbug.getMMFile().path); } }, 1000, Ci.nsITimer.TYPE_ONE_SHOT);
					mm_exists = false;
				} else {
					mm_exists = true;
					// Flash Player Debugger config (mm.cfg) file created for the first time.
					alertTimer.initWithCallback({ notify:function(timer) { Flashbug.alert($FL_STR("flashbug.logPanel.mmCreate")); } }, 1000, Ci.nsITimer.TYPE_ONE_SHOT);
				}
			} else {
				// is not writeable, please check permissions
				alertTimer.initWithCallback({ notify:function(timer) { Flashbug.alert(Flashbug.getMMDirectory().path + $FL_STR("flashbug.logPanel.error.write")); } }, 1000, Ci.nsITimer.TYPE_ONE_SHOT);
				mm_exists = false;
			}
		}
		
		if(!mm_exists) {
			//Flash Player Debugger config (mm.cfg) file does not exist
			alertTimer.initWithCallback({ notify:function(timer) { Flashbug.alert($FL_STR("flashbug.logPanel.error.mm2")); } }, 1000, Ci.nsITimer.TYPE_ONE_SHOT);
		}
		
		// Update settings based on whats actually in the mm.cfg file
		var settings = Flashbug.readMMFile();
		for (var prop in settings) {
			Firebug.setPref(Firebug.prefDomain, 'flashbug.' + prop, settings[prop]);
		}
	},
	
	readFile: function() {
		//this.trace("readFile " + this.selectedReader.name, this);
		
		// Read the file
		var cis = CCIN("@mozilla.org/intl/converter-input-stream;1", "nsIConverterInputStream");
		var hasmore;
		var line = {};
		var modified = false;
		var file = this.selectedReader.name == "Trace" ? Flashbug.getLogFile() : Flashbug.getPolicyFile();
		try {
			// If file has changed since last read
			if(this.selectedReader.lastModifiedTime != file.lastModifiedTime || this.selectedReader.fileSize != file.fileSize) {		
				modified = true;
				this.selectedReader.arrText = [];
				this.selectedReader.lastModifiedTime = file.lastModifiedTime;
				this.selectedReader.fileSize = file.fileSize;
				
				// Read File
				var fis = CCIN("@mozilla.org/network/file-input-stream;1", "nsIFileInputStream");
				fis.init(file, 0x01, 00004, null);
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
		// Override getHidden in these templates. The parsed XML documen is
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
		//this.trace("displayValues2 " + i + ' length:' + l, this);
		i = 0;
		while (i < l) {
			text = this.selectedReader.arrTextDiff[i];
			
			// Remove double spaces from AIR
			// BUG: Doesn't work, but works in Flex
			//text = text.replace(/\x0D$/gm, '');
			
			i++;
			
			// Limit lines drawn
			//this.trace("displayValues3 " + i + ' maxLines:' + maxLines, this);
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
					className += ' flb-trace-row-error-icon';
				case 'subError' :
				case 'sandboxSubError' :
					className += ' flb-trace-row-error';
					break;
				case 'warning' :
					text = text.replace(matchResult.pattern, '');
				case 'nativeWarning' :
					className += ' flb-trace-row-warning';
					break;
				case 'info' :
					className += ' flb-trace-row-info';
					text = text.replace(matchResult.pattern, '');
					break; 
				case 'xml' :
					text = text.replace(matchResult.pattern, '');
					break; 
			}
			
			var div = this.panel.document.createElement('div');
			
			// Auto parse JSON
			try {
				//this.trace('[:' + text.indexOf('[') + ' {:' + text.indexOf('{'));
				if (text.indexOf('[') != 0 && text.indexOf('{') != 0) throw 'Simple data, just display 1';
				
				text = JSON.parse(text);
				Firebug.DOMPanel.DirTable.tag.replace({object: text, toggles: {}}, div);
				//Firebug.DOMPanel.DirTable.tag.replace({object: text}, div);
				div.setAttribute('class', 'flb-trace-row');
			} catch(err) {
				// Auto parse XML
				//if (text.indexOf('<') == 0) {
				if (text.match(regexXMLStart) != null) {
					// Parse response and create DOM.
					var parser = CCIN('@mozilla.org/xmlextras/domparser;1', 'nsIDOMParser');
					var doc = parser.parseFromString(text, 'text/xml');
					var root = doc.documentElement;
					
					// Error handling
					var nsURI = 'http://www.mozilla.org/newlayout/xml/parsererror.xml';
					if (root.namespaceURI == nsURI && root.nodeName == 'parsererror') {
						this.trace('xml error - "' + text + '"');
						Firebug.FlashbugModel.XMLError.tag.replace({error: {
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
					// New
					text = text.replace('<', '&lt;', 'g');
					text = text.replace('>', '&gt;', 'g');
					text = text.replace('&quot;', '"', 'g');
					text = text.replace(/(\s*)((\w+:\/\/)([-\w\.]+)+(:\d+)?(\/([\w/_\-\.]*(\?[^\s"]+)?)?)?)/ig, "$1<span title='$2' class='flb-link' >$2</span>");
					
					// Old - was reading the & in &lt; and breaking the link
					//text = text.replace(/(\s*)((\w+:\/\/)[-a-zA-Z0-9:@;?&=\/%\+\.\*!'\(\),\$_\{\}\^~\[\]`#|]+)/ig, "$1<span title='$2' class='flb-link' >$2</span>");
					//this.trace('normal - "' + text + '"');
					div.innerHTML = text;
					div.setAttribute('class', className);
				}
			}
			
			//this.trace("displayValues4 append", div);
			docFrag.appendChild(div);
		}
		
		// Copied from XMLViewer // 
		for (var i=0; i<originals.length; i++) {
            templates[i].getHidden = originals[i];
		}
		//
		
		//this.trace("displayValues5 docFrag", docFrag);
		
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
				//trace(line + ' : ' + pattern['pattern'] + ' : ' + line.match(pattern['pattern']));
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

Firebug.FlashbugModel.Rep = domplate(Firebug.Rep, {
	inspectable: false,
	
    getContextMenuItems: function(cookie, target, context) {
        // xxxHonza not sure how to do this better if the default Firebug's "Copy"
        // command (cmd_copy) shouldn't be there.
        var popup = $("fbContextMenu");
        if (popup.firstChild && popup.firstChild.getAttribute("command") == "cmd_copy") popup.removeChild(popup.firstChild);
    }
});

Firebug.FlashbugModel.XMLError = domplate(Firebug.FlashbugModel.Rep, {
	inspectable: false,
	
	tag:
        DIV({class: "flb-trace-row"},
            DIV({class: "flb-trace-row-error-xml"}, "$error.message"),
            PRE({class: "flb-trace-row-error-xml-source"}, "$error.source")
        )
});

Firebug.FlashbugModel.PanelDiv = domplate(Firebug.FlashbugModel.Rep, {
	inspectable: false,
	
	tag:
        DIV({class: "flb-trace-text"},
            DIV({class: "flb-trace-info-trace-text flb-trace-info-text"}),
            DIV({class: "flb-trace-info-policy-text flb-trace-info-text"}),
            DIV({class: "flb-trace-disabled-text"},
				$FL_STR("flashbug.logPanel.cleared")
			)
        )
});


// Panel Implementation
//-----------------------------------------------------------------------------

function FlashbugPanel() { }
FlashbugPanel.prototype = extend(Firebug.ActivablePanel, {
    
	//////////////////////////////////////////////////////////////////////////////////////////////
	// Panel                                                                                    //
	//////////////////////////////////////////////////////////////////////////////////////////////
	//{
	
	// supports search
	//searchable: false,
	
	// clicking on contents in the panel will invoke the inline editor, eg the CSS Style panel or HTML panel.
	//editable: true,
	
	// if true, supports break-on-next (the pause button functionality)
	//breakable: false,
	
	// relative position of the panel as a side panel, this is how Style appears on left in HTML main panel
	//order: 2147483647,
	
	//  the character used to separate items on the panel status (aka breadcrumbs) in the tool bar, eg ">"  in the DOM panel
	//statusSeparator: "<",
	
	// true if the panel wants to participate in A11y accessibility support.
	//enableA11y: false,
	
	// Name of the panel that uses the same a11y logic.
	//deriveA11yFrom: null,

	/*initialize: function(context, doc) {
		if (!context.browser) {
			if (FBTrace.DBG_ERRORS) FBTrace.sysout("attempt to create panel with dud context!");
			return false;
		}
		
		this.context = context;
		this.document = doc;
		
		this.panelNode = doc.createElement("div");
		this.panelNode.ownerPanel = this;
		
		setClass(this.panelNode, "panelNode panelNode-"+this.name+" contextUID="+context.uid);
		
		// Load persistent content if any.
		var persistedState = Firebug.getPanelState(this);
		if (persistedState) {
			this.persistContent = persistedState.persistContent;
			if (this.persistContent && persistedState.panelNode) this.loadPersistedContent(persistedState);
		}
		
		doc.body.appendChild(this.panelNode);
		
		// Update panel's tab in case the break-on-next (BON) is active.
		var shouldBreak = this.shouldBreakOnNext();
		Firebug.Breakpoint.updatePanelTab(this, shouldBreak);
		
		if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("firebug.initialize panelNode for "+this.name+"\n");
		
		this.initializeNode(this.panelNode);
	},*/

	// Panel may store info on state
	/*destroy: function(state) {
		if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("firebug.destroy panelNode for "+this.name+"\n");
		
		if (this.panelNode) {
			if (this.persistContent) {
				this.savePersistedContent(state);
			} else {
				delete state.persistContent;
			}
			
			delete this.panelNode.ownerPanel;
		}
		
		this.destroyNode();
		
		clearDomplate(this.panelNode);
	},*/

	/*savePersistedContent: function(state) {
		state.panelNode = this.panelNode;
		state.persistContent = this.persistContent;
	},*/

	/*loadPersistedContent: function(persistedState) {
		// move the nodes from the persistedState to the panel
		while (persistedState.panelNode.firstChild) {
			this.panelNode.appendChild(persistedState.panelNode.firstChild);
		}
		
		scrollToBottom(this.panelNode);
	},*/

	// called when a panel in one XUL window is about to appear in another one.
	/*detach: function(oldChrome, newChrome) {
	},*/

	// this is how a panel in one window reappears in another window; lazy called
	/*reattach: function(doc) {
		this.document = doc;
		
		if (this.panelNode) {
			this.panelNode = doc.adoptNode(this.panelNode, true);
			this.panelNode.ownerPanel = this;
			doc.body.appendChild(this.panelNode);
		}
	},*/

	// Called at the end of module.initialize; addEventListener-s here
	/*initializeNode: function(panelNode) {
		dispatch(this.fbListeners, "onInitializeNode", [this]);
	},*/

	// removeEventListener-s here.
	/*destroyNode: function() {
		dispatch(this.fbListeners, "onDestroyNode", [this]);
	},*/

	// persistedPanelState plus non-persisted hide() values
	/*show: function(state) {
	},*/

	// store info on state for next show.
	/*hide: function(state) {
	},*/

	/*watchWindow: function(win) {
	},*/

	/*unwatchWindow: function(win) {
	},*/

	/*updateOption: function(name, value) {
	},*/

	/*
	 * Called after chrome.applyTextSize
	 * @param zoom: ratio of current size to normal size, eg 1.5
	 */
	/*onTextSizeChange: function(zoom) {
	},*/

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	/**
	 * Toolbar helpers
	 */
	/*showToolbarButtons: function(buttonsId, show) {
		tr {
			var buttons = Firebug.chrome.$(buttonsId);
			collapse(buttons, !show);
		} catch (exc) {
			if (FBTrace.DBG_ERRORS) FBTrace.sysout("firebug.Panel showToolbarButtons FAILS "+exc, exc);
		}
	},*/

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	/**
	 * Returns a number indicating the view's ability to inspect the object.
	 *
	 * Zero means not supported, and higher numbers indicate specificity.
	 */
	/*supportsObject: function(object, type) {
		return 0;
	},*/

	// beyond type testing, is this object selectable?
	/*hasObject: function(object) {
		return false;
	},*/

	/*navigate: function(object) {
		if (FBTrace.DBG_PANELS) FBTrace.sysout("navigate "+this.name+" to "+object+" when this.location="+this.location+"\n");
		if (!object) object = this.getDefaultLocation(this.context);
		if (!object) object = null;  // not undefined.
		
		// if this.location undefined, may set to null
		if ( !this.location || (object != this.location) ) {
			if (FBTrace.DBG_PANELS) FBTrace.sysout("navigate "+this.name+" to location "+object+"\n");
			
			this.location = object;
			this.updateLocation(object);
			
			dispatch(Firebug.uiListeners, "onPanelNavigate", [object, this]);
		}
	},*/

	// if the module can return null from getDefaultLocation, then it must handle it here.
	/*updateLocation: function(object) {
	},*/

	/**
	 * Navigates to the next document whose match parameter returns true.
	 */
	/*navigateToNextDocument: function(match, reverse) {
		// This is an approximation of the UI that is displayed by the location
		// selector. This should be close enough, although it may be better
		// to simply generate the sorted list within the module, rather than
		// sorting within the UI.
		var self = this;
		function compare(a, b) {
			var locA = self.getObjectDescription(a);
			var locB = self.getObjectDescription(b);
			if(locA.path > locB.path)
				return 1;
			if(locA.path < locB.path)
				return -1;
			if(locA.name > locB.name)
				return 1;
			if(locA.name < locB.name)
				return -1;
			return 0;
		}
		var allLocs = this.getLocationList().sort(compare);
		for (var curPos = 0; curPos < allLocs.length && allLocs[curPos] != this.location; curPos++);
		
		function transformIndex(index) {
			if (reverse) {
				// For the reverse case we need to implement wrap around.
				var intermediate = curPos - index - 1;
				return (intermediate < 0 ? allLocs.length : 0) + intermediate;
			} else {
				return (curPos + index + 1) % allLocs.length;
			}
		};
		
		for (var next = 0; next < allLocs.length - 1; next++) {
			var object = allLocs[transformIndex(next)];
			
			if (match(object)) {
				this.navigate(object);
				return object;
			}
		}
	},*/

	/*select: function(object, forceUpdate) {
		if (!object) object = this.getDefaultSelection(this.context);
		
		if(FBTrace.DBG_PANELS) FBTrace.sysout("firebug.select "+this.name+" forceUpdate: "+forceUpdate+" "+object+((object==this.selection)?"==":"!=")+this.selection);
		
		if (forceUpdate || object != this.selection) {
			this.selection = object;
			this.updateSelection(object);
			
			dispatch(Firebug.uiListeners, "onObjectSelected", [object, this]);
		}
	},*/


	/*updateSelection: function(object) {
	},*/

	/*refresh: function() {
	},*/

	/*markChange: function(skipSelf) {
		if (this.dependents) {
			if (skipSelf) {
				for (var i = 0; i < this.dependents.length; ++i) {
					var panelName = this.dependents[i];
					if (panelName != this.name) this.context.invalidatePanels(panelName);
				}
			} else {
				this.context.invalidatePanels.apply(this.context, this.dependents);
			}
		}
	},*/

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	/*startInspecting: function() {
	},*/

	/*stopInspecting: function(object, cancelled) {
	},*/

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	/*search: function(text, reverse) {
	},*/

	/**
	 * Retrieves the search options that this modules supports.
	 * This is used by the search UI to present the proper options.
	 */
	/*getSearchOptionsMenuItems: function() {
		return [
			Firebug.Search.searchOptionMenu("search.Case Sensitive", "searchCaseSensitive")
		];
	},*/

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	// Called when "Options" clicked. Return array of
	// {label: 'name', nol10n: true,  type: "checkbox", checked: <value>, command:function to set <value>}
	/*getOptionsMenuItems: function() {
		return null;
	},*/

	/*
	 * Called by chrome.onContextMenu to build the context menu when this panel has focus.
	 * See also FirebugRep for a similar function also called by onContextMenu
	 * Extensions may monkey patch and chain off this call
	 * @param object: the 'realObject', a model value, eg a DOM property
	 * @param target: the HTML element clicked on.
	 * @return an array of menu items.
	 */
	/*getContextMenuItems: function(object, target) {
		return [];
	},*/

	/*getBreakOnMenuItems: function() {
		return [];
	},*/

	/*getEditor: function(target, value) {
	},*/

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	/*getDefaultSelection: function(context) {
		return null;
	},*/

	/*browseObject: function(object) {
	},*/

	/*getPopupObject: function(target) {
		return Firebug.getRepObject(target);
	},*/

	/*getTooltipObject: function(target) {
		return Firebug.getRepObject(target);
	},*/

	/*showInfoTip: function(infoTip, x, y) {
	},*/

	/*getObjectPath: function(object) {
		return null;
	},*/

	// An array of objects that can be passed to getObjectLocation.
	// The list of things a panel can show, eg sourceFiles.
	// Only shown if panel.location defined and supportsObject true
	/*getLocationList: function() {
		return null;
	},*/

	/*getDefaultLocation: function(context) {
		return null;
	},*/

	/*getObjectLocation: function(object) {
		return "";
	},*/

	// Text for the location list menu eg script panel source file list
	// return.path: group/category label, return.name: item label
	/*getObjectDescription: function(object) {
		var url = this.getObjectLocation(object);
		return FBL.splitURLBase(url);
	},*/

	/*
	 *  UI signal that a tab needs attention, eg Script panel is currently stopped on a breakpoint
	 *  @param: show boolean, true turns on.
	 */
	/*highlight: function(show) {
		var tab = this.getTab();
		if (!tab) return;
		
		if (show) {
			tab.setAttribute("highlight", "true");
		} else {
			tab.removeAttribute("highlight");
		}
	},*/

	/*getTab: function() {
		var chrome = Firebug.chrome;
		
		var tab = chrome.$("fbPanelBar2").getTab(this.name);
		if (!tab) tab = chrome.$("fbPanelBar1").getTab(this.name);
		return tab;
	},*/

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Support for Break On Next

	/**
	 * Called by the framework when the user clicks on the Break On Next button.
	 * @param {Boolean} armed Set to true if the Break On Next feature is
	 * to be armed for action and set to false if the Break On Next should be disarmed.
	 * If 'armed' is true, then the next call to shouldBreakOnNext should be |true|.
	 */
	/*breakOnNext: function(armed) {
	},*/

	/**
	 * Called when a panel is selected/displayed. The method should return true
	 * if the Break On Next feature is currently armed for this panel.
	 */
	/*shouldBreakOnNext: function() {
		return false;
	},*/

	/**
	 * Returns labels for Break On Next tooltip (one for enabled and one for disabled state).
	 * @param {Boolean} enabled Set to true if the Break On Next feature is
	 * currently activated for this panel.
	 */
	/*getBreakOnNextTooltip: function(enabled) {
		return null;
	},*/
	//}
	//////////////////////////////////////////////////////////////////////////////////////////////
	// ActivablePanel                                                                           //
	//////////////////////////////////////////////////////////////////////////////////////////////
	//{
	//activable: true,

	/*isActivable: function() {
		return this.activable;
	},*/

	/*isEnabled: function() {
		if (!this.isActivable()) return true;
		
		if (!this.name) return false;
		
		return Firebug.getPref(Firebug.prefDomain + "." + this.name, "enableSites");
	},*/

	/*setEnabled: function(enable) {
		if (!this.name || !this.activable) return;
		
		var prefDomain = Firebug.prefDomain + "." + this.name;
		
		// Proper activation preference must be available.
		var type = prefs.getPrefType(prefDomain + ".enableSites")
		if (type != Ci.nsIPrefBranch.PREF_BOOL) {
			if (FBTrace.DBG_ERRORS || FBTrace.DBG_ACTIVATION) FBTrace.sysout("firebug.ActivablePanel.setEnabled FAILS not a PREF_BOOL: " + type);
			return;
		}
		
		Firebug.setPref(prefDomain, "enableSites", enable);
	},*/

	/**
	* Called when an instance of this panel type is enabled or disabled. Again notice that
	* this is a class method and so, panel instance variables (like e.g. context) are
	* not accessible from this method.
	* @param {Object} enable Set to true if this panel type is now enabled.
	*/
	/*onActivationChanged: function(enable) {
		// TODO: Use Firebug.ActivableModule.addObserver to express dependencies on modules.
	},*/
	//}
	//////////////////////////////////////////////////////////////////////////////////////////////
	// Shared Objects Panel                                                                     //
	//////////////////////////////////////////////////////////////////////////////////////////////
	
	trace: function(msg, obj) {
		msg = "Flashbug - Panel::" + msg;
		if (FBTrace.DBG_FLASH_PANEL) {
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
		
		// Init player version detection
		if(Firebug.FlashbugModel.jsPlayerVersion == "") {
			var version = $FL_STR("flashbug.noPlayer");
			
			// Version = '10.1.53.64'
			var p = navigator.plugins["Shockwave Flash"];
			
			if(p) {
				var d = navigator.plugins["Shockwave Flash"].version;
				if (d && !(typeof navigator.mimeTypes != "undefined" && navigator.mimeTypes[SWF_MIME] && !navigator.mimeTypes[SWF_MIME].enabledPlugin)) {
					version = Flashbug.getOS().toUpperCase() + " ";
					d = p.version;
					d = d.replace(/\./g, ',');
					version += d + " ";
					version += $FL_STR("flashbug.unknownVersion");
				}
			}
			
			this.trace("initializeNode - " + version);
			Firebug.FlashbugModel.jsPlayerVersion = version;
		}
		
		// Add Divs
		Firebug.FlashbugModel.PanelDiv.tag.replace({}, this.panelNode, this);
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
		var selectedReader = Firebug.FlashbugModel.selectedReader;
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
					context.chrome.window.openDialog("chrome://flashbug/content/settings.xul", "", "chrome,modal,close");
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
			Firebug.FlashbugModel.onPause(null, this);
		} else {
			Firebug.FlashbugModel.onPlay(null, this);
		}
	},
	
	shouldBreakOnNext: function() {
		return Firebug.FlashbugModel.selectedReader.paused;
	},
	
	////////////////////////////
	// Flash Console Specific //
	////////////////////////////
	
	name: panelName,
    title: $FL_STR("flashbug.logPanel.title"),
	traceNode: null,
	policyNode: null,
	selectedNode: null,
	
	showLog: function() {
		this.trace("showLog - " + Firebug.getPref(Firebug.prefDomain, "flashbug.defaultTab"));
		
		if(this.selectedNode) this.selectedNode.removeAttribute("selected");
		this.selectedNode = getChildByClass(this.panelNode.firstChild, "flb-trace-info-" + Firebug.getPref(Firebug.prefDomain, "flashbug.defaultTab").toLowerCase() + "-text");
		this.selectedNode.setAttribute("selected", "true");
		
		// So search doesn't freeze when switching logs
		delete this.currentSearch;
	},
	
	showVersion: function() {
		var version = Firebug.FlashbugModel.playerVersion == "" ? Firebug.FlashbugModel.jsPlayerVersion : Firebug.FlashbugModel.playerVersion;
		this.trace("showVersion : '" + version + "'");
		
		// If we know for sure they have the debugger, hide link
		if(version.indexOf("Debug") != -1) Firebug.chrome.$("fbFlashbugDownload").style.display = 'none';
		
		Firebug.chrome.$("flbVersion").value = $FL_STR("flashbug.playerVersion") + " " + version;
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
		var selectedReader = Firebug.FlashbugModel.selectedReader;
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

var fbVersion = Firebug.version.split('.');
if (fbVersion[0] >= 1 && fbVersion[1] >= 6) {
	Firebug.registerActivableModule(Firebug.FlashbugModel);
	Firebug.registerPanel(FlashbugPanel);
} else {
	var alertTimer = CCIN('@mozilla.org/timer;1', 'nsITimer');
	alertTimer.initWithCallback({ notify:function(timer) { Flashbug.alert('Flashbug 1.7 was designed for Firebug 1.6 or higher. Firebug ' + Firebug.version + ' was found, please install a newer version.', 'Error'); } }, 1000, Ci.nsITimer.TYPE_ONE_SHOT);
}

/////////////////////////////
// Firebug Trace Constants //
/////////////////////////////

FBTrace.DBG_FLASH = 		Firebug.getPref(Firebug.prefDomain, "DBG_FLASH");
FBTrace.DBG_FLASH_PANEL = 	Firebug.getPref(Firebug.prefDomain, "DBG_FLASH_PANEL");
FBTrace.DBG_FLASH_MODEL = 	Firebug.getPref(Firebug.prefDomain, "DBG_FLASH_MODEL");

}});

function objFlash_DoFSCommand(command, args) {
	switch (command) {
		case "init":
			// If Flashbug had an error loading, don't use it
			if(Firebug.FlashbugModel) {
				Firebug.FlashbugModel.playerVersion = unescape(args);
				
				// Call showVersion once the SWF has updated the value
				if (Firebug.currentContext && Firebug.currentContext.getPanel("flashbug")) Firebug.currentContext.getPanel("flashbug").showVersion();
			}
			break;
	}
}