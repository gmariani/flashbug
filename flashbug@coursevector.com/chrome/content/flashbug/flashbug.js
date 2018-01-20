// Check if Flash Player Trust File needs to be created
if(!Flashbug.checkTrustFile()) Flashbug.saveTrustFile();

FBL.ns(function() { with (FBL) {

/*
FEATURE: Custom filters/coloring

1.5 - 
Fixed regex expression for urls
Fixed regex expression for urls in xml
Fixed multiline XML with blank lines from AIR apps
Fixed space between "Player Version:" and version number
Can now open the log file directly
Read SharedObject
(For Firebug 1.4+) Read AMF/Remoting Request Data (not response) (Example: http://www.adobe.com/devnet/flex/tourdeflex/web/#sampleId=13300;illustIndex=0;docIndex=0)

1.6 - 
Fixed directory locations
Cleaned up code some
Added AMF/Remoting Response Data
Added support for Flex/BlazeDS Classes
Updated JS Player version detection
Updated Player version display
Updated mm.cfg creating conditions

1.6.1 -
Fixed duplicate trace problem
Fixed localhost sharedobject bug

1.6.2 -
Fixed Mac OSX save pref bug

1.6.3 -
Fixed SharedObject discovery bug
Fixed Mac OSX mm.cfg location, for real this time

1.6.4 - 
Better error message when unable to clear log file
Correctly Clear log file
Fixed mm.cfg location on setups where My Documents is placed different than default
RC1
Fixed mm.cfg location on Vista (regression)
Fixed Ubuntu Trust File
Updated Player Version display
RC2


1.7 - 
Update Parsers to Minerva 3.2
Add ability to parse SWFs and display metadata - https://addons.mozilla.org/en-US/firefox/addon/45361?src=oftenusedwith
Add ability to display @@JSON@@ as a navigable object - https://addons.mozilla.org/en-US/firefox/addon/55979?src=oftenusedwith
Get AMF exporting working properly
*/

// Constants
const PR_UINT32_MAX = 0xFFFFFFFF;
const panelName = "flashbug";
const FirebugPrefDomain = "extensions.firebug"; // FirebugPrefDomain is not defined in 1.05.
const NS_SEEK_SET = Ci.nsISeekableStream.NS_SEEK_SET;
const observerService = CCSV("@mozilla.org/observer-service;1", "nsIObserverService");

// Helper array for prematurely created contexts
var contexts = new Array();
var trace = Flashbug.trace;

// Preference Helpers
//-----------------------------------------------------------------------------

// This functions are different in 1.05 and 1.2
function getPref(prefDomain, name) {
	if(Firebug.version == "1.05") return Firebug.getPref(name);
	return Firebug.getPref(prefDomain, name);
}
Flashbug.getPref = getPref;

function setPref(prefDomain, name, value) {
	if(Firebug.version == "1.05") Firebug.setPref(name, value);
	Firebug.setPref(prefDomain, name, value);
}
Flashbug.setPref = setPref;

// Array Helpers
//-----------------------------------------------------------------------------

function cloneMap(map) {
	var newMap = {};
	for (var item in map) {
		newMap[item] = map[item];
	}
	return newMap;
};

// Cache Helps
//-----------------------------------------------------------------------------

function getCacheKey(request) {
	var is = request.QueryInterface(Ci.nsIUploadChannel).uploadStream;
	
	var ss = is.QueryInterface(Ci.nsISeekableStream);
	ss.seek(NS_SEEK_SET, 0);
	
	var ch = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
	ch.init(ch.MD5);
	ch.updateFromStream(ss, ss.available());
	
	return ch.finish(true);
};

function saveStream(stream, filename) {
	try {
		var dir = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
		var file = dir.get("Desk", Ci.nsIFile);
		file.append("Flashbug");
		file.append(filename);
		file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0777);
		
		var fos = Cc["@mozilla.org/network/safe-file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
		fos.init(file, -1, 0777, 0); // write, create, truncate
		
		var bos = Cc["@mozilla.org/network/buffered-output-stream;1"].createInstance(Ci.nsIBufferedOutputStream);
		bos.init(fos, 8192);
		
		/*var count = stream.available();
		while(count > 0) {
			count -= bos.writeFrom(stream, count);
		}*/
		for (var count = stream.available(); count; count = stream.available()) {
			bos.writeFrom(stream, count);
		}
	} catch (e) {
		ERROR(e);
	} finally {
		if (fos) {
			if (fos instanceof Ci.nsISafeOutputStream) {
				fos.finish();
			} else {
				fos.close();
			}
		}
	}
};

function safeGetName(request) {
	try {
		return request.name;
	} catch (e) {
		return null;
	}
};

function isAmfRequest(request) {
	if (!request.contentType) return false;
	var contentType = trim(request.contentType.split(";")[0]);
	return "application/x-amf" == contentType;
}

// Localization
//-----------------------------------------------------------------------------

// Extend string bundle with new strings for this extension.
// This must be done yet before domplate definitions.
if (Firebug.registerStringBundle) Firebug.registerStringBundle("chrome://flashbug/locale/flashbug.properties");

function $FL_STR(name) {
	if (Firebug.registerStringBundle) return $STR(name);
	
	try {
		return document.getElementById("strings_flashbug").getString(name);
	} catch (e) {
		trace("Flashbug::Missing translation for: " + name + "\n");
	}
	
	// Use only the label after last dot.
	var index = name.lastIndexOf(".");
	if (index > 0) name = name.substr(index + 1);
	return name;
};
Flashbug.$FL_STR = $FL_STR;

function $FL_STRF(name, args) {
	if (Firebug.registerStringBundle) return $STRF(name), args;
	
	try {
		return document.getElementById("strings_flashbug").getFormattedString(name, args);
	} catch (e) {
		trace("Flashbug::Missing translation for: " + name + "\n");
	}
	
	// Use only the label after last dot.
	var index = name.lastIndexOf(".");
	if (index > 0) name = name.substr(index + 1);
	return name;
};
Flashbug.$FL_STRF = $FL_STRF;

// Search Helpers
//-----------------------------------------------------------------------------

// If older version of Firebug
if (typeof getElementsByClass == "undefined") {
	function cloneArray(array, fn) {
		var newArray = [];
		if (fn) {
			for (var i = 0; i < array.length; ++i) {
				newArray.push(fn(array[i]));
			}
		} else {
			for (var i = 0; i < array.length; ++i) {
				newArray.push(array[i]);
			}
		}
		
		return newArray;
	}

	getElementsByClass = function(node, className) { // className, className, ...
		function iteratorHelper(node, classNames, result) {
			for (var child = node.firstChild; child; child = child.nextSibling) {
				var args1 = cloneArray(classNames);
				args1.unshift(child);
				if (FBL.hasClass.apply(null, args1)) result.push(child);
				iteratorHelper(child, classNames, result);
			}
		}
		
		var result = [];
		var args = cloneArray(arguments);
		args.shift();
		iteratorHelper(node, args, result);
		return result;
	};
}

function onOpenTab(url) {
	trace("Flashbug - onOpenTab");
	gBrowser.selectedTab = gBrowser.addTab(url);
}

function onOpen(url) {
	trace("Flashbug - onOpen");
	var f = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	f.initWithPath(url);
	launchFile(f);
}

function launchFile(f) {
	try {
		f.launch();
	} catch (ex) {
		// if launch fails, try sending it through the system's external
		var uri = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService).newFileURI(f);
		var protocolSvc = Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService);
		protocolSvc.loadUrl(uri);
	}
}

function onReveal(url) {
	trace("Flashbug - onReveal");
	var f = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	f.initWithPath(url);
	
	try {
		f.reveal();
	} catch (ex) {
		// If reveal fails for some reason (e.g., it's not implemented on unix or
		// the file doesn't exist), try using the parent if we have it.
		var parent = f.parent.QueryInterface(Ci.nsILocalFile);
		if (!parent) return;
		
		// "Double click" the parent directory to show where the file should be
		onOpen(parent.path);
	}
}

// Module Implementation
//-----------------------------------------------------------------------------

var BaseModule = Firebug.ActivableModule ? Firebug.ActivableModule : Firebug.Module;

Firebug.AMFInfoTab = extend(BaseModule, {
	
	amfReader: new Flashbug.AMF(),
	
    initialize: function() {
        if(Firebug.NetMonitor.NetInfoBody.addListener) Firebug.NetMonitor.NetInfoBody.addListener(this);
    },
	
    shutdown: function() {
        if(Firebug.NetMonitor.NetInfoBody.removeListener) Firebug.NetMonitor.NetInfoBody.removeListener(this);
    },

    // Listener for NetInfoBody.
    initTabBody: function(infoBox, file) {
		if ((!file.requestAMF || !file.responseAMF) && isAmfRequest(file.request)) {
			file.category = "html";
			Firebug.NetMonitor.NetInfoBody.appendTab(infoBox, "AMFInfo", $FL_STR("flashbug.amfinfo.tab.title"));
		}
	},
	
    destroyTabBody: function(infoBox, file) {},
	
	toggle: {},
	
    updateTabBody: function(infoBox, file, context) {
		// Get currently selected tab.
		var tab = infoBox.selectedTab;
		
		// Generate content only for the first time; and only if our tab 
		// has been just activated.
		if (tab.dataPresented || !hasClass(tab, "netInfoAMFInfoTab")) return;
		
		// Make sure the content is generated just once.
		tab.dataPresented = true;
		
		// Get body element associated with the tab.
		var tabBody = getElementByClass(infoBox, "netInfoAMFInfoText");
		file.category = "html";
		
		// Request
		if(!file.requestAMF) {
			try {
				var is = file.request.QueryInterface(Ci.nsIUploadChannel).uploadStream;
				if (is) {
					var ss = is.QueryInterface(Ci.nsISeekableStream);
					if (ss) ss.seek(NS_SEEK_SET, 0);
					
					// Read headers
					var ba = new Flashbug.ByteArray(ss);
					var line = ba.readString();
					while(line) {
						//trace("Got a request header: [" + line + "]");
						/*var tmp = line.match(/^([^:]+):\s?(.*)/);
						// match can return null...
						if (tmp) {
							postHeader(tmp[1], tmp[2]);
						} else {
							postHeader(line, "");
						}*/
						line = ba.readString();
					}
					
					// Read data
					file.requestAMF = this.amfReader.deserialize(ba);
				}
			} catch (e) {
				ERROR(e);
			}
		}
		
		// Response
		if(!file.responseAMF) {
			try {
				var is = file.responseStream;
				if (is) {
					var ss = is.QueryInterface(Ci.nsISeekableStream);
					if (ss)  {
						ss.seek(NS_SEEK_SET, 0);
						
						// Read headers
						var ba = new Flashbug.ByteArray(ss);
						
						// Read data
						file.responseAMF = this.amfReader.deserialize(ba);
					}
				}
			} catch (e) {
				ERROR(e);
			}
		}
		
		// Create container html
		var tabBody = Firebug.FlashbugModel.AMFInfo.tag.replace({}, tabBody);
		
        // Generate UI using Domplate template (from HTML panel).
		if(file.requestAMF) Firebug.DOMPanel.DirTable.tag.replace({object: file.requestAMF, toggles: this.toggles}, getChildByClass(tabBody, "flashbugAMFRequest"));
        if(file.responseAMF) Firebug.DOMPanel.DirTable.tag.replace({object: file.responseAMF, toggles: this.toggles}, getChildByClass(tabBody, "flashbugAMFResponse"));
	}
});

Firebug.FlashbugModel = extend(BaseModule, {
	
	panelName: panelName,
	panel: null,
	traceReader: null,
	policyReader: null,
	solReader: null,
	selectedReader: null,
	cacheListener: null,
	netListener: null,
	playerVersion: "",
	jsPlayerVersion: "",
	// Set to true if all hooks for monitoring cookies are registered; otherwise false.
    observersRegistered: false,
	
	trace: function(msg) {
		msg = "Flashbug - Model::" + msg;
		if (FBTrace.DBG_FLASH_MODEL) {
			if (typeof FBTrace.sysout == "undefined") {
				alert(msg);
			} else {
				FBTrace.sysout(msg);
			}
		}
	},
	
	//////////////////////
	// Firebug Specific //
	//////////////////////
	
	// Called when the window is opened.
	initialize: function() {
		this.trace("initialize");
		
		this.panelName = panelName;
		this.panel = FirebugContext ? FirebugContext.getPanel(panelName) : null;
		this.description = $FL_STR("flashbug.modulemanager.description");
		
		// Add AMF as a cached content type
		var cachedTypes = getPref(FirebugPrefDomain, "cache.mimeTypes");
		if(cachedTypes && cachedTypes.indexOf("application/x-amf") == -1) {
			if(cachedTypes.length > 0) {
				cachedTypes += " ";
			}
			cachedTypes += "application/x-amf";
			setPref(FirebugPrefDomain, "cache.mimeTypes", cachedTypes);
		}
		
		BaseModule.initialize.apply(this, arguments);
		
		if(Firebug.TabCacheModel) {
			// Register cache listener
			this.cacheListener = new CacheListener();
			Firebug.TabCacheModel.addListener(this.cacheListener);
			
			// Register NetMonitor listener
			this.netListener = new NetListener(this.cacheListener);
			Firebug.NetMonitor.addListener(this.netListener);
		}
		
		// All the necessary observers are registered by default. Even if the 
        // panel can be disabled (entirely or for a specific host) there is
        // no simple way to find out this now, as the context isn't available. 
        // All will be unregistered again in the initContext (if necessary).
        // There is no big overhead, the initContext is called just after the
        // first document request.
        this.registerObservers(null);
	},
	
	/**
     * Peforms clean up when Firebug is destroyed.
     * Called by the framework when Firebug is closed for an existing Firefox window.
     */
    shutdown: function() {
		if(Firebug.TabCacheModel) {
			// Unregister cache listener
			Firebug.TabCacheModel.removeListener(this.cacheListener);
			
			// Unregister NetMonitor listener
			Firebug.NetMonitor.removeListener(this.netListener);
		}
		
        this.unregisterObservers(null);
    },
	
	// CSS helper
    addStyleSheet: function(panel) {
		this.trace("addStyleSheet");
        // Make sure the stylesheet isn't appended twice. 
        var doc = panel.document;
        if ($("flashbugStyles", doc)) return;
        
        var styleSheet = createStyleSheet(doc, "chrome://flashbug/skin/flashbug.css");
        styleSheet.setAttribute("id", "flashbugStyles");
	    addStyleSheet(doc, styleSheet);
    },
	
	//After "onSelectingPanel", a panel has been selected but is not yet visible
    showPanel: function(browser, panel) {
		this.trace(" ");
		this.trace(" ");
		this.trace("showPanel() - " + panel.panelNode.id);
		if(!this.activeContexts) this.activeContexts = [];
		
		// For backward compatibility with Firebug 1.1, update panel's toolbar
        var isFlashPanel = panel && panel.name == panelName;
		
		// Firebug 1.4, chrome changes.
        var chrome = browser.chrome ? browser.chrome : Firebug.chrome;
		
        var flashButtons = chrome.$("fbFlashbugButtons");
        var flashVersion = chrome.$("fbFlashbugVersion");
        collapse(flashButtons, !isFlashPanel);
        collapse(flashVersion, !isFlashPanel);
		
		if (isFlashPanel) {
			this.addStyleSheet(panel);
			
			Firebug.FlashbugModel.traceReader.initContext(panel);
			Firebug.FlashbugModel.policyReader.initContext(panel);
			Firebug.FlashbugModel.solReader.initContext(panel, panel.context);
			
			this.selectLog(panel.context, getPref(FirebugPrefDomain, "flashbug.defaultTab"));
		}
		
		if(Flashbug.getMMFile().fileSize == 0) this.initMMFile(true);
		
		//if(this.isEnabled(panel.context) && !this.selectedReader.paused) this.play();
    },
	
	/**
     * Support for ActivableModule
     */
    onPanelActivate: function(context, init, activatedPanelName) {
        if (activatedPanelName != panelName) return;
		this.trace("onPanelActivate() - " + panelName);
		
		this.registerObservers(context);
		
        // Make sure the panel is refreshed (no page reload)
        context.invalidatePanels(panelName);
		
        // Make sure the toolbar is updated.
        // xxxHonza: This should be done automatically by calling "panel.show mehtod",
        // where the visibility of the toolbar is already managed.
        // Why Firebug doesn't call show within Firebug.panelActivate?
        var panel = context.getPanel(panelName, true);
        if (panel) {
			panel.showToolbarButtons("fbFlashbugButtons", true);
			panel.showToolbarButtons("fbFlashbugVersion", true);
		}
    },
	
	onPanelDeactivate: function(context, destroy, activatedPanelName) {
		this.unregisterObservers(context);
    },
	
	// When the number of activeContexts decreases to zero. Modules should remove listeners, disable function that takes resources
	onSuspendFirebug: function(context) {
		this.trace("onSuspendFirebug");
		
		this.onDisabled(context);
    },
	
	// When the number of activeContexts increases from zero. Modules should undo the work done in onSuspendFirebug
    onResumeFirebug: function(context) {
		this.trace("onResumeFirebug");
		this.onEnabled(context);
    },
	
	getMenuLabel: function(option, location) {
		this.trace("getMenuLabel");
		var host = getURIHost(location);
		
        // In case of local files or system pages use this labels instead of host.
        // xxxHonza: the panel should be automatically disabled for local files
        // and system pages as there are no cookies associated.
        // These options shouldn't be available at all.
        if (isSystemURL(location.spec)) {
            host = $FL_STR("flashbug.SystemPages");
        } else if (!getURIHost(location)) {
            host = $FL_STR("flashbug.LocalFiles");
		}
		
        // Translate these two options in panel activable menu from flashbug.properties
        switch (option) {
			case "disable-site":
				return $FL_STRF("flashbug.HostDisable", [host]);
			case "enable-site":
				return $FL_STRF("flashbug.HostEnable", [host]);
        }
		
        return BaseModule.getMenuLabel.apply(this, arguments);
    },
	
	isEnabled: function(context) {
        // For backward compatibility with Firebug 1.1. ActivableModule has been introduced in Firebug 1.2.
        if (!Firebug.ActivableModule) return true;
        return BaseModule.isEnabled.apply(this, arguments);
    },
	
	// called for each context at the end of enable
    onEnabled: function(context) {
		this.trace("onEnabled");
		
		if (context) {
            // Firebug 1.3
            this.registerObservers(context);
        } else {
            // Firebug 1.4 (context parameter doesn't exist since 1.4)
            if (Firebug.FlashbugModel.isAlwaysEnabled()) TabWatcher.iterateContexts(Firebug.FlashbugModel.registerObservers);
        }
		
		if(this.selectedReader) this.selectedReader.onSelect();
    },
	
	// called for each context at the end of disable
    onDisabled: function(context) {
		this.trace("onDisabled");
		
		if (context) {
            // Firebug 1.3
            this.unregisterObservers(context);
        } else {
            // Firebug 1.4 (context parameter doesn't exist since 1.4)
            // Suspend only if enabled.
            if (Firebug.FlashbugModel.isAlwaysEnabled()) TabWatcher.iterateContexts(Firebug.FlashbugModel.unregisterObservers);
        }
		
		if(this.policyReader) this.policyReader.onDeselect();
		if(this.traceReader) this.traceReader.onDeselect();
		if(this.solReader) this.solReader.onDeselect();
		
		// For some reason this isn't called til user interacts with webpage Firebug 1.4
		if(context) {
			var panel = context.getPanel(panelName, true);
			if(panel) panel.hide();
		}
    },
	
	// Helper context
    initTempContext: function(tempContext) {
		this.trace("initTempContext");
		//tempContext.cookieTempObserver = registerCookieObserver(new CookieTempObserver(tempContext));
		
        // Create sub-context for domains.
        tempContext.solDomains = {};
    },

    destroyTempContext: function(tempContext, context) {
        if (!tempContext) return;
		this.trace("destroyTempContext");
		
        // Copy all active hosts on the page. In case of redirects or embedded IFrames, there
        // can be more hosts (domains) involved on the page. Cookies must be displayed for
        // all of them.
        context.solDomains = cloneMap(tempContext.solDomains);
		
        delete tempContext.solDomains;
		
        // Unregister temporary cookie observer.
        //tempContext.cookieTempObserver = unregisterCookieObserver(tempContext.cookieTempObserver);
    },
	
	// Called when a new context is created but before the page is loaded.
	initContext: function(context, persistedState) {
		this.trace("initContext");
		
		var tabId = getTabIdForWindow(context.window);
		this.panel = context.getPanel(panelName);
		
		// Create sub-context for solDomains. 
        // xxxHonza: the solDomains object exists within the context even if 
        // the panel is disabled.
        context.solDomains = {};
		
		// The temp context isn't created e.g. for empty tabs, chrome pages.
        var tempContext = contexts[tabId];
        if (tempContext) {
            this.destroyTempContext(tempContext, context);
            delete contexts[tabId];
        }
		
		BaseModule.initContext.apply(this, arguments);
		
		// Unregister all observers if the panel is disabled.
        if (!this.isEnabled(context)) this.unregisterObservers(context);
		
		this.initMMFile(false);
    },
	
	destroyContext: function(context) {
		this.trace("destroyContext");
        BaseModule.destroyContext.apply(this, arguments);
		
        delete context.solDomains;
    },
	
	// Called when a FF tab is create or activated (user changes FF tab)
    // Called after context is created or with context == null (to abort?)
	/*showContext: function(browser, context) {
		this.trace("showContext");
        BaseModule.showContext.apply(this, arguments);
		this.refresh(context);
    },*/
	
	///////////////////////
	// Flashbug Specific //
	///////////////////////
	
	registerObservers: function(context) {
		if (this.observersRegistered) return;
		trace("Flashbug - Model::registerObservers"); // For some reason it can't find this.trace
		
		observerService.addObserver(HttpObserver, "http-on-modify-request", false);
		observerService.addObserver(HttpObserver, "http-on-examine-response", false);
		
		this.observersRegistered = true;
    },

    unregisterObservers: function(context) {
		if (!this.observersRegistered) return;
		this.trace("unregisterObservers");
		
		observerService.removeObserver(HttpObserver, "http-on-modify-request");
		observerService.removeObserver(HttpObserver, "http-on-examine-response");
		
		this.observersRegistered = false;
    },
	
	clear: function(context) {
		this.trace("clear");
		this.selectedReader.clear();
    },
	
	openFile: function(context) {
		var file = this.selectedReader.name == "Trace" ? Flashbug.getLogFile() : Flashbug.getPolicyFile();
		this.trace("openFile: " + file.path);
		launchFile(file);
	},
	
	reparse: function(context) {
		this.trace("reparse");
		if(this.solReader) {
			this.solReader.refresh();
		}
	},
	
	initMMFile: function(force) {
		this.trace("initMMFile");
		var mm_exists = true;
		if(Flashbug.getMMFile().fileSize == 0 || force) {
			if(Flashbug.getMMDirectory().isWritable()) {
				var valEnableErrors = getPref(FirebugPrefDomain, "flashbug.enableErrors") ? 1 : 0;
				var valEnablePolicy = getPref(FirebugPrefDomain, "flashbug.enablePolicy") ? 1 : 0;
				var valEnablePolicyAppend = getPref(FirebugPrefDomain, "flashbug.enablePolicyAppend") ? 1 : 0;
				var valEnableOuputBuff = getPref(FirebugPrefDomain, "flashbug.traceOutputBuffered") ? 1 : 0;
				var valEnableVerbose = getPref(FirebugPrefDomain, "flashbug.aS3Verbose") ? 1 : 0;
				var valEnableTrace = getPref(FirebugPrefDomain, "flashbug.aS3Trace") ? 1 : 0;
				var valEnableStatic = getPref(FirebugPrefDomain, "flashbug.aS3StaticProfile") ? 1 : 0;
				var valEnableDynamic = getPref(FirebugPrefDomain, "flashbug.aS3DynamicProfile") ? 1 : 0;
				var result = Flashbug.saveMMFile(valEnableErrors, getPref(FirebugPrefDomain, "flashbug.maxWarnings"), valEnablePolicy, valEnablePolicyAppend, valEnableOuputBuff, valEnableVerbose, valEnableTrace, valEnableStatic, valEnableDynamic);
				if(result != true) {
					this.trace("initMMFile: " + result);
					// Cannot create the Flash Player Debugger config (mm.cfg) file in
					alert($FL_STR("flashbug.mmError") + Flashbug.getMMFile().path);
					mm_exists = false;
				} else {
					mm_exists = true;
					// Flash Player Debugger config (mm.cfg) file created for the first time.
					alert($FL_STR("flashbug.mmCreate"));
				}
			} else {
				// is not writeable, please check permissions
				alert(Flashbug.getMMDirectory().path + $FL_STR("flashbug.writeError"));
				mm_exists = false;
			}
		}
		
		if(!mm_exists) {
			this.refresh();
			this.pause();
			//Flash Player Debugger config (mm.cfg) file does not exist
			alert($FL_STR("flashbug.mmError2"));
		}
	},
	
	pause: function(context) {
		this.trace("pause");
		this.selectedReader.pause();
		
		var panel = context.getPanel(panelName, true);
		if(panel) panel.refreshChrome();
	},
	
	play: function(context) {
		this.trace("play");
		this.selectedReader.play();
		
		var panel = context.getPanel(panelName, true);
		if(panel) panel.refreshChrome();
	},
	
	refresh: function(context) {
		this.trace("refresh");
		this.traceReader.synchronize();
		this.policyReader.synchronize();
		this.solReader.refresh();
	},
	
	selectLog: function(context, view) {
		this.trace("selectLog() - " + view);
		setPref(FirebugPrefDomain, "flashbug.defaultTab", view);
		
		if(view == "Trace") {
			this.selectedReader = this.traceReader;
			this.traceReader.onSelect();
			this.policyReader.onDeselect();
			this.solReader.onDeselect();
		} else if(view == "Policy") {
			this.selectedReader = this.policyReader;
			this.traceReader.onDeselect();
			this.policyReader.onSelect();
			this.solReader.onDeselect();
		} else {
			this.selectedReader = this.solReader;
			this.traceReader.onDeselect();
			this.policyReader.onDeselect();
			this.solReader.onSelect();
		}
		
		var panel = context.getPanel(panelName, true);
		if(panel) panel.selectLog();
    }
});

function TempContext(tabId) {
    this.tabId = tabId;
}

var HttpObserver = {
	
	QueryInterface: function(aIID) {
        if (aIID.equals(Ci.nsIObserver) || aIID.equals(Ci.nsISupportsWeakReference) || aIID.equals(Ci.nsISupports)) {
            return this;
        }
		
        throw Components.results.NS_NOINTERFACE;
    },

	observe: function(aSubject, aTopic, aData) {
		try {
			aSubject = aSubject.QueryInterface(Ci.nsIHttpChannel);
			if (aTopic == "http-on-modify-request") {
				this.onModifyRequest(aSubject);
			} else if (aTopic == "http-on-examine-response") {
				this.onExamineResponse(aSubject);
			}
		} catch(e) {
			ERROR(e);
		}
	},
	
	onModifyRequest: function(request) {
		var name = request.URI.asciiSpec; // asciiSpec / spec
		var origName = request.originalURI.asciiSpec; // asciiSpec / spec
		var tabId = getTabIdForRequest(request);
		var win = getWindowForRequest(request);
		
		// Firebus's natures is to display information for a tab. So, if there
		// is no tab associated then end.
		if (!tabId) return;
		
		// At this moment (specified by all the conditions) FB context doesn't exists yet.
        // But the page already started loading and there are things to monitor.
        // This is why the temporary context is created. It's used as a place where to 
        // store information (cookie events and hosts). All this info will be copied into
        // the real FB context when it's created (see initContext).
        if ((request.loadFlags & Ci.nsIHttpChannel.LOAD_DOCUMENT_URI) && (request.loadGroup && request.loadGroup.groupObserver) && (name == origName) && (win == win.parent)) {
			// Create temporary context
			if (!contexts[tabId]) {
				var tempContext = new TempContext(tabId);
				contexts[tabId] = tempContext;
				
				Firebug.FlashbugModel.initTempContext(tempContext);
			}
        }
		
        // Use the temporary context first, if it exists. There could be an old
        // context (associated with this tab) for the previous URL.
        var context = contexts[tabId];
        context = context ? context : TabWatcher.getContextByWindow(win);
		
        // The context doesn't have to exist due to the activation support.
        if (!context) return;
		
		this.addDomain(context, request, name);
    },

	onExamineResponse: function(request) {
		var tabId = getTabIdForRequest(request);
		if (!tabId) return;
		
		// Try to get the context from the contexts array first. The TabWatacher
        // could return context for the previous page in this tab.
        var context = contexts[tabId];
        var win = getWindowForRequest(request);
        context = context ? context : TabWatcher.getContextByWindow(win);
		
        // The context doesn't have to exist due to the activation support.
        if (!context) return;
		
		this.addDomain(context, request, request.URI.asciiSpec);
	},
	
	addDomain: function(context, request, href) {
		var domain = getPrettyDomain(href);
		var fullDomain = getDomain(href);
		
		// Fix domains with ports
		var portIndex = domain.lastIndexOf(":");
		if (portIndex != -1) domain = domain.slice(0, portIndex);
		
		// Fix localhost
		if (domain == "localhost") domain = "#" + domain;
		
		// For some reason some shared objects aren't saved to the domain, but the basedomain
		// Maybe for old swfs? The example is Flash 6
		// i.e. http://netticat.ath.cx/BetterPrivacy/BetterPrivacy.htm
		var arrDomain = domain.split(".");
		while(arrDomain.length > 2) {
			arrDomain.shift();
		}
		var baseDomain = arrDomain.join(".");
		
		// Get MIME Type
		var mimeType = null;
		try {
			mimeType = request.contentType;
		} catch(e) { }
		if (!mimeType && getFileExtension(href) == "swf") mimeType = "application/x-shockwave-flash";
		
		// If is a SWF, add domain(s)
		if(mimeType == "application/x-shockwave-flash") {
			var hasAdded = false;
			if (!context.solDomains[domain]) {
				context.solDomains[domain] = domain;
				hasAdded = true;
				trace("Flashbug - HttpObserver::addDomain: " + context.solDomains[domain]);
			}
			
			if (!context.solDomains[fullDomain]) {
				context.solDomains[fullDomain] = fullDomain;
				hasAdded = true;
				trace("Flashbug - HttpObserver::addDomain: " + context.solDomains[fullDomain]);
			}
			
			if (!context.solDomains[baseDomain]) {
				context.solDomains[baseDomain] = baseDomain;
				hasAdded = true;
				trace("Flashbug - HttpObserver::addDomain: " + context.solDomains[baseDomain]);
			}
			
			// Refresh the panel asynchronously.
			if(hasAdded && context instanceof Firebug.TabContext) context.invalidatePanels(panelName); 
		}
	}
};

//	Tab Cache Listener
//-----------------------------------------------------------------------------

function CacheListener() {
	this.cache = {};
	this.shouldCacheRequest = function(request) {
		return isAmfRequest(request);
	};
};

CacheListener.prototype = {
	responses: [],
	
	getResponse: function(request, cacheKey) {
		if (!cacheKey) cacheKey = getCacheKey(request);
		
		if (!cacheKey) return;
		
		var response = this.responses[cacheKey];
		if (!response) {
			this.invalidate(cacheKey);
			this.responses[cacheKey] = response = {
				request: request,
				size: 0
			};
		}
		
		return response;
	},
	
	getResponseStreamFromCache: function(cacheKey) {
		try {
			return this.cache[cacheKey].storageStream.newInputStream(0);
		} catch (e) {
			return null;
		}
	},
	
	invalidate: function(cacheKey) {		
		delete this.cache[cacheKey];
	},
	
	onStartRequest: function(context, request, requestContext) {
		if (isAmfRequest(request)) this.getResponse(request);
	},
	
	onDataAvailable: function(context, request, requestContext, inputStream, offset, count)	{
		if (isAmfRequest(request)) {
			try {
				var cacheKey = getCacheKey(request);
				
				if (!cacheKey) return;
				
				if (!this.cache[cacheKey]) {
					this.cache[cacheKey] = {
						storageStream: Cc["@mozilla.org/storagestream;1"].createInstance(Ci.nsIStorageStream),
						outputStream: Cc["@mozilla.org/binaryoutputstream;1"].createInstance(Ci.nsIBinaryOutputStream)
					};
					
					this.cache[cacheKey].storageStream.init(8192, PR_UINT32_MAX, null);
					this.cache[cacheKey].outputStream.setOutputStream(this.cache[cacheKey].storageStream.getOutputStream(0));
				}
				
				var binaryInputStream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
				binaryInputStream.setInputStream(inputStream.value);
				
				var listenerStorageStream = Cc["@mozilla.org/storagestream;1"].createInstance(Ci.nsIStorageStream);
				listenerStorageStream.init(8192, count, null);
				
				var listenerOutputStream = Cc["@mozilla.org/binaryoutputstream;1"].createInstance(Ci.nsIBinaryOutputStream);
				listenerOutputStream.setOutputStream(listenerStorageStream.getOutputStream(0));
				
				var data = binaryInputStream.readByteArray(count);
				listenerOutputStream.writeByteArray(data, count);
				this.cache[cacheKey].outputStream.writeByteArray(data, count);
				
				var response = this.getResponse(request, cacheKey);
				response.size += count;
				
				// Let other listeners use the stream.
				inputStream.value = listenerStorageStream.newInputStream(0);
			} catch (e) {
				ERROR(e);
			}
		}
	},
	
	onStopRequest: function(context, request, requestContext, statusCode) {
		if (isAmfRequest(request)) {
			var cacheKey = getCacheKey(request);
			delete this.responses[request];
			
			// Should save?
			if (getPref(FirebugPrefDomain, "flashbug.saveResponses")) {
				saveStream(this.cache[cacheKey].storageStream.newInputStream(0), cacheKey.replace(/\W/g,"") + ".amf");
			}
		}
	}
};

//	Net Panel Listener
//-----------------------------------------------------------------------------

function NetListener(tabCacheListener) {
	this.tabCacheListener = tabCacheListener;
}

NetListener.prototype = {
	onResponseBody: function(context, file) {
		if (isAmfRequest(file.request)) {
			try {
				var cacheKey = getCacheKey(file.request);
				file.responseStream = this.tabCacheListener.getResponseStreamFromCache(cacheKey);
				this.tabCacheListener.invalidate(cacheKey);
			} catch (e) {
				ERROR(e);
			}
		}
	}
};

function getWindowForRequest(request) {
    var webProgress = getRequestWebProgress(request);
    return webProgress ? safeGetWindow(webProgress) : null;
}

function getTabIdForRequest(request) {
    try {
        if (request.notificationCallbacks) {
            var interfaceRequestor = request.notificationCallbacks.QueryInterface(Ci.nsIInterfaceRequestor);
            try {
                var win = interfaceRequestor.getInterface(Ci.nsIDOMWindow);
                var tabId = getTabIdForWindow(win);
                if (tabId) return tabId;
            } catch (e) { }
        }
		
        var progress = getRequestWebProgress(request);
        var win = safeGetWindow(progress);
        return getTabIdForWindow(win);
    } catch (err) {
        ERROR(err);
    }

    return null;
}

function getTabIdForWindow(aWindow) {
    aWindow = getRootWindow(aWindow);
	var tabBrowser = $("content");

    if (!aWindow || !tabBrowser.getBrowserIndexForDocument) return null;

    try {
        var targetDoc = aWindow.document;
        var tab = null;
        var targetBrowserIndex = tabBrowser.getBrowserIndexForDocument(targetDoc);
		
        if (targetBrowserIndex != -1) {
            tab = tabBrowser.tabContainer.childNodes[targetBrowserIndex];
            return tab.linkedPanel;
        }
    } catch (e) {}

    return null;
}

function getRequestWebProgress(request) {
    try {
        if (request.notificationCallbacks) return request.notificationCallbacks.getInterface(Ci.nsIWebProgress);
    } catch (exc) {}

    try {
        if (request.loadGroup && request.loadGroup.groupObserver) return QI(request.loadGroup.groupObserver, Ci.nsIWebProgress);
    } catch (e) {}

    return null;
}

function safeGetWindow(webProgress) {
    try {
        if (webProgress) return webProgress.DOMWindow;
    } catch (e) {
        return null;
    }
}

/**
 * @domplate Basic template for all Flashbug templates.
 */
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
        DIV({class: "flashbugRow"},
            DIV({class: "flashbugRowXMLError"}, "$error.message"),
            PRE({class: "flashbugRowXMLErrorSource"}, "$error.source")
        )
});

Firebug.FlashbugModel.AMFInfo = domplate(Firebug.FlashbugModel.Rep, {
	inspectable: false,
	
	tag:
        DIV({style:"display: block;"},
			DIV({class: "netInfoHeadersGroup"}, "Request"),
            DIV({class: "flashbugAMFRequest"}),
			DIV({class: "netInfoHeadersGroup"}, "Response"),
            DIV({class: "flashbugAMFResponse"})
        )
});

Firebug.FlashbugModel.PanelDiv = domplate(Firebug.FlashbugModel.Rep, {
	inspectable: false,
	
	tag:
        DIV({},
            DIV({class: "flashbugInfoTraceText flashbugInfoText"}),
            DIV({class: "flashbugInfoPolicyText flashbugInfoText"}),
            DIV({class: "flashbugInfoCookieText flashbugInfoText"})
        )
});

/**
 * @domplate Represents a template for basic cookie list layout. This
 * template also includes a header and related functionality (such as sorting).
 */
Firebug.FlashbugModel.CookieTable = domplate(Firebug.FlashbugModel.Rep, {
    inspectable: false,

    tableTag:
        TABLE({class: "cookieTable", cellpadding: 0, cellspacing: 0, hiddenCols: ""},
            TBODY(
                TR({class: "cookieHeaderRow", onclick: "$onClickHeader"},
                    TD({id: "colName", class: "cookieHeaderCell alphaValue"},
                        DIV({class: "cookieHeaderCellBox", title: $FL_STR("flashbug.cookie.colName.tooltip")}, $FL_STR("flashbug.cookie.colName.title"))
                    ),
                    TD({id: "colVersion", class: "cookieHeaderCell alphaValue"},
                        DIV({class: "cookieHeaderCellBox", title: $FL_STR("flashbug.cookie.colVersion.tooltip")}, $FL_STR("flashbug.cookie.colVersion.title"))
                    ),
                    TD({id: "colSize", class: "cookieHeaderCell"},
                        DIV({class: "cookieHeaderCellBox", title: $FL_STR("flashbug.cookie.colSize.tooltip")}, $FL_STR("flashbug.cookie.colSize.title"))
                    ),
					TD({id: "colSWF", class: "cookieHeaderCell"},
                        DIV({class: "cookieHeaderCellBox", title: $FL_STR("flashbug.cookie.colSWF.tooltip")}, $FL_STR("flashbug.cookie.colSWF.title"))
                    ),
                    TD({id: "colPath", class: "cookieHeaderCell alphaValue"},
                        DIV({class: "cookieHeaderCellBox", title: $FL_STR("flashbug.cookie.colPath.tooltip")}, $FL_STR("flashbug.cookie.colPath.title"))
                    )
                )
            )
        ),

    onClickHeader: function(event) {
        if (!isLeftClick(event)) return;
        var table = getAncestorByClass(event.target, "cookieTable");
        var column = getAncestorByClass(event.target, "cookieHeaderCell");
        this.sortColumn(table, column);
    },

    sortColumn: function(table, col, direction) {
        if (!col) return;
		
        if (typeof(col) == "string") {
            var doc = table.ownerDocument;
            col = doc.getElementById(col);
        }
		
        if (!col) return;
		
        var numerical = !hasClass(col, "alphaValue");
		
        var colIndex = 0;
        for (col = col.previousSibling; col; col = col.previousSibling) {
            ++colIndex;
		}
		
        this.sort(table, colIndex, numerical, direction);
    },

    sort: function(table, colIndex, numerical, direction) {
        var tbody = table.lastChild;
        var headerRow = tbody.firstChild;
		
        // Remove class from the currently sorted column
        var headerSorted = getChildByClass(headerRow, "cookieHeaderSorted");
        removeClass(headerSorted, "cookieHeaderSorted");
		
        // Mark new column as sorted.
        var header = headerRow.childNodes[colIndex];
        setClass(header, "cookieHeaderSorted");
		
        // If the column is already using required sort direction, bubble out.
        if ((direction == "desc" && header.sorted == 1) || (direction == "asc" && header.sorted == -1)) return;
		
        var values = [];
        for (var row = tbody.childNodes[1]; row; row = row.nextSibling) {
            var cell = row.childNodes[colIndex];
            var value = numerical ? parseFloat(cell.textContent) : cell.textContent;
			
            if (hasClass(row, "opened")) {
                var cookieInfoRow = row.nextSibling;
                values.push({row: row, value: value, info: cookieInfoRow});
                row = cookieInfoRow;
            } else {
                values.push({row: row, value: value});
            }
        }
		
        values.sort(function(a, b) { return a.value < b.value ? -1 : 1; });
		
        if ((header.sorted && header.sorted == 1) || (!header.sorted && direction == "asc")) {
            removeClass(header, "sortedDescending");
            setClass(header, "sortedAscending");
			
            header.sorted = -1;
			
            for (var i = 0; i < values.length; ++i) {
                tbody.appendChild(values[i].row);
                if (values[i].info) tbody.appendChild(values[i].info);
            }
        } else {
            removeClass(header, "sortedAscending");
            setClass(header, "sortedDescending");
			
            header.sorted = 1;
			
            for (var i = values.length-1; i >= 0; --i) {
                tbody.appendChild(values[i].row);
                if (values[i].info) tbody.appendChild(values[i].info);
            }
        }
		
        // Remember last sorted column & direction in preferences.
        var prefValue = header.getAttribute("id") + " " + (header.sorted > 0 ? "desc" : "asc");
		setPref(FirebugPrefDomain, "flashbug.lastSortedColumn", prefValue);
    },

    supportsObject: function(object) {
        return (object == this);
    },
	
    createTable: function(parentNode) {
        // Create cookie table UI.
        var table = this.tableTag.replace({}, parentNode, this);
        return table;
    }
});

// Cookie Template (domplate)
//-----------------------------------------------------------------------------

/**
 * @domplate Represents a domplate template for cookie entry in the cookie list.
 */
Firebug.FlashbugModel.CookieRow = domplate(Firebug.FlashbugModel.Rep, {
    inspectable: false,

    cookieTag:
        FOR("cookie", "$cookies",
            TR({class: "cookieRow", _repObject: "$cookie", onclick: "$onClickRow"},
                TD({class: "cookieNameCol cookieCol"},
                    DIV({class: "cookieNameLabel cookieLabel"}, "$cookie|getName")
                ),
                TD({class: "cookieVersionCol cookieCol"},
                    SPAN({class: "cookieVersionLabel cookieLabel"}, "$cookie|getVersion")
                ),
                TD({class: "cookieSizeCol cookieCol"},
                    DIV({class: "cookieSizeLabel cookieLabel"}, "$cookie|getSize")
                ),
				TD({class: "cookieSWFCol cookieCol"},
                    DIV({class: "cookieSWFLabel cookieLabel"}, "$cookie|getSWF")
                ),
                TD({class: "cookiePathCol cookieCol"},
                    DIV({class: "cookiePathLabel cookieLabel", title: "$cookie|getPath"},
                        SPAN("$cookie|getPath")
                    )
                )
            )
        ),

    bodyRow:
        TR({class: "cookieInfoRow"},
            TD({class: "cookieInfoCol", colspan: 5},
				DIV({class: "cookieInfoBody"},
					DIV({class: "cookieInfoValueText cookieInfoText", selected:true})
				)
			)
        ),

	hasProperties: function (ob) {
		try {
			for (var name in ob) {
				return true;
			}
		} catch (exc) {}
		return false;
	},
	
    getName: function(cookie) {
        return cookie.header.fileName;
    },

    getVersion: function(cookie) {
        return "AMF" + cookie.header.amfVersion;
    },

    getSize: function(cookie) {
        var size = cookie.fileSize;
        return this.formatSize(size);
    },
	
	getSWF: function(cookie) {
		var swf = cookie.swf;
		if(swf.indexOf(".swf") == -1) swf = null;
        return swf ? swf : "?";
	},

    formatSize: function(bytes) {
        if (bytes == -1 || bytes == undefined) {
            return "?";
        } else if (bytes < 1024) {
            return bytes + " B";
        } else if (bytes < 1024*1024) {
            return Math.ceil(bytes/1024) + " KB";
        } else {
            return (Math.ceil(bytes/1024)/1024) + " MB";    // OK, this is probable not necessary ;-)
		}
    },

    getPath: function(cookie) {
        var path = cookie.path;
        return path ? path : "?";
    },
	
	// Firebug rep support
    supportsObject: function(cookie) {
        return (cookie.fullPath && cookie.fileSize && cookie.header && cookie.body);
    },
	
	browseObject: function(cookie, context) {
        return false;
    },

    getRealObject: function(cookie, context) {
        return cookie.body;
    },
	
	onRemove: function(url) {
		var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
		file.initWithPath(url);
		
		if(file.exists()) {
			try {
				file.remove(false);
			} catch (e) {
				ERROR(e);
			}
		}
		
		if(Firebug.FlashbugModel.solReader) Firebug.FlashbugModel.solReader.refresh();
	},
	
	getContextMenuItems: function(data, target, context) {
        var items = [];
		var url = data.fullPath;
		
		// xxxHonza not sure how to do this better if the default Firebug's "Copy"
        // command (cmd_copy) shouldn't be there.
        var popup = $("fbContextMenu");
        if (popup.firstChild && popup.firstChild.getAttribute("command") == "cmd_copy") popup.removeChild(popup.firstChild);
		
		items.push(
			{label: $FL_STR("flashbug.contextMenu.delete"), nol10n: true, command: bindFixed(this.onRemove, this, url) },
			"-",
			{label: $FL_STR("flashbug.contextMenu.open"), nol10n: true, command: bindFixed(onOpen, this, url) },
			{label: $FL_STR("flashbug.contextMenu.openFolder"), nol10n: true, command: bindFixed(onReveal, this, url) },
			"-",
			{label: $FL_STR("flashbug.contextMenu.copyLocation"), nol10n: true, command: bindFixed(copyToClipboard, FBL, url) }
		);
		
        return items;
    },

    onClickRow: function(event) {
        if (isLeftClick(event)) {
            var row = getAncestorByClass(event.target, "cookieRow");
            if (row) {
                this.toggleRow(row);
                cancelEvent(event);
            }
        }
    },
	
	toggles: {},

    toggleRow: function(row) {
        var opened = hasClass(row, "opened");
        toggleClass(row, "opened");
        if (hasClass(row, "opened")) {
            var bodyRow = this.bodyRow.insertRows({}, row)[0];
			Firebug.DOMPanel.DirTable.tag.replace({object: row.repObject.body, toggles: this.toggles}, bodyRow.childNodes[0].childNodes[0].childNodes[0]);
        } else {
			row.parentNode.removeChild(row.nextSibling);
        }
    }
});

// Panel Implementation
//-----------------------------------------------------------------------------

// Firebug.AblePanel has been renamed in Firebug 1.4 to ActivablePanel.
var BasePanel = Firebug.AblePanel ? Firebug.AblePanel : Firebug.Panel;
BasePanel = Firebug.ActivablePanel ? Firebug.ActivablePanel : BasePanel;

function FlashbugPanel() { }
FlashbugPanel.prototype = extend(BasePanel, {
    name: panelName,
    title: $FL_STR("flashbug.title"),
	searchable: true,

	txtVersion:null,
	cbTrace:null,
	cbPolicy:null,
	cbCookie:null,
	btnPlayPause:null,
	btnClear:null,
	btnOpen:null,
	btnRefresh:null,
	btnDownload:null,
	
	trace: function(msg) {
		msg = "Flashbug - Panel::" + msg;
		if (FBTrace.DBG_FLASH_PANEL) {
			if (typeof FBTrace.sysout == "undefined") {
				alert(msg);
			} else {
				FBTrace.sysout(msg);
			}
		}
	},
	
	//////////////////////
	// Firebug Specific //
	//////////////////////
	
    /*initialize: function(context, doc) {
		this.trace("initialize");
		BasePanel.initialize.apply(this, arguments);
    },*/
	
	// Called at the end of module.initialize; addEventListener-s here
	initializeNode: function(panelNode) {
		this.trace("initializeNode");
		
		if(!this.panelNode.id ) this.panelNode.id = Math.random();
		
		this.refreshElements();
		
		// Init player version detection
		if(Firebug.FlashbugModel.jsPlayerVersion == "") Firebug.FlashbugModel.jsPlayerVersion = this.getJSPlayerVersion();
		this.showVersion();
		
		this.refresh();
	},
	
	/*
	destroyNode: function() {
		this.trace("destroyNode");
	},
	
	detach: function(oldChrome, newChrome) {
		this.trace("detach");
        BasePanel.detach.apply(this, arguments);
    },*/

	reattach: function(doc) { // this is how a panel in one window reappears in another window; lazy called
		this.trace("reattach");
		
		this.refreshElements();
		this.showVersion();
		this.refreshChrome();
		
		BasePanel.reattach.apply(this, arguments);
	},
	
	/*enablePanel: function(module) {
		this.trace("enablePanel");
		BasePanel.enablePanel.apply(this, arguments);
	},
	
	disablePanel: function(module) {
		this.trace("disablePanel");
		BasePanel.disablePanel.apply(this, arguments);
	},*/
	
	refresh: function() {
		this.trace("refresh");
		
		// Add Divs
		Firebug.FlashbugModel.PanelDiv.tag.replace({}, this.panelNode, this);
		
		// Init readers
		// BUG Sometimes solReader would return null
		if(Firebug.FlashbugModel.traceReader == null || Firebug.FlashbugModel.policyReader == null || Firebug.FlashbugModel.solReader == null) {
			Firebug.FlashbugModel.traceReader = 	new Flashbug.LogReader("Trace", getElementByClass(this.panelNode.firstChild, "flashbugInfoTraceText"),		this);
			Firebug.FlashbugModel.policyReader = 	new Flashbug.LogReader("Policy", getElementByClass(this.panelNode.firstChild, "flashbugInfoPolicyText"), 	this);
			Firebug.FlashbugModel.solReader = 		new Flashbug.SOLReader("Cookie", getElementByClass(this.panelNode.firstChild, "flashbugInfoCookieText"), 	this);
		} else {
			Firebug.FlashbugModel.traceReader.initContext(this);
			Firebug.FlashbugModel.policyReader.initContext(this);
			Firebug.FlashbugModel.solReader.initContext(this, this.context);
			if(Firebug.FlashbugModel.selectedReader) this.selectLog();
		}
		
		// Open last/default tab
		var defaultTab = getPref(FirebugPrefDomain, "flashbug.defaultTab");
		if(defaultTab == "Trace") {
			this.cbTrace.checked = true;
		} else if(defaultTab == "Policy") {
			this.cbPolicy.checked = true;
		} else {
			this.cbCookie.checked = true;
		}
	},
	
	updateScroll: function() {
		//this.trace("updateScroll");
		if (getPref(FirebugPrefDomain, "flashbug.autoScroll")) {
			var node = Firebug.FlashbugModel.selectedReader.node.parentNode.parentNode;
			node.scrollTop = node.scrollHeight - node.offsetHeight;
		}
	},
	
	// persistedPanelState plus non-persisted hide() values
	// (disablePanel) The panel was disabled so, show the disabled page. This page also replaces the
    // old content so, the panel is fresh empty after it's enabled again.
	show: function(state) {
		this.trace("show() / " + this.panelNode.id);
		
		// For backward compatibility with Firebug 1.1
		if (Firebug.ActivableModule) {
			var enabled = Firebug.FlashbugModel.isEnabled(this.context);
			this.trace("show() - " + enabled);
			this.showToolbarButtons("fbFlashbugButtons", enabled);
			this.showToolbarButtons("fbFlashbugVersion", enabled);
			if (!enabled) {
				// The activation model has been changed in Firebug 1.4. This is 
                // just to keep backward compatibility.
				if (Firebug.DisabledPanelPage && Firebug.DisabledPanelPage.show) {
					Firebug.DisabledPanelPage.show(this, Firebug.FlashbugModel);
				} else if(Firebug.FlashbugModel.disabledPanelPage) {
					Firebug.FlashbugModel.disabledPanelPage.show(this);
				} else {
					Firebug.ModuleManagerPage.show(this, Firebug.FlashbugModel);
				}
                return;
			}
		}
		
		this.refresh();
		this.selectLog();
	},
	
	// store info on state for next show.
	hide: function(state) {
		this.trace("hide");
		if (Firebug.ActivableModule) {
			this.showToolbarButtons("fbFlashbugButtons", false);
			this.showToolbarButtons("fbFlashbugVersion", false);
		}
	},
	
	getContextMenuItems: function(data, target, context) {
		this.trace("getContextMenuItems");
        var items = [];
		
		// xxxHonza not sure how to do this better if the default Firebug's "Copy"
        // command (cmd_copy) shouldn't be there.
        var popup = $("fbContextMenu");
        if (popup.firstChild && popup.firstChild.getAttribute("command") == "cmd_copy") popup.removeChild(popup.firstChild);
		
		if(target.className == "flashbugLink") {
			var url = target.textContent;
			items.push({label: $FL_STR("flashbug.contextMenu.copyLocation"), nol10n: true, command: bindFixed(copyToClipboard, FBL, url) });
			items.push({label: $FL_STR("flashbug.contextMenu.openTab"), nol10n: true, command: bindFixed(onOpenTab, this, url) });
		} else {
			items.push({label: $FL_STR("flashbug.contextMenu.copy"), nol10n: true, command: bindFixed(copyToClipboard, FBL, target.textContent) });
		}
		
        return items;
    },
	
	getOptionsMenuItems: function(context) {
		this.trace("getOptionsMenuItems");
		return [
			this.optionMenu($FL_STR("flashbug.options.autoscroll"), "flashbug.autoScroll"),
			
			"-",
			{
				label: $FL_STR("flashbug.options.pref"),
				nol10n: true,
				type: "button",
				command: function() {
					context.chrome.window.openDialog("chrome://flashbug/content/settings.xul", "", "chrome,modal,close");
				}
			}
		];
    },
	
	optionMenu: function(label, option) {
		this.trace("optionMenu");
        var value = getPref(FirebugPrefDomain, option);
        return {
            label: label,
            nol10n: true,
            type: "checkbox",
            checked: value,
            command: bindFixed(setPref, this, FirebugPrefDomain, option, !value)
        };
    },
	
	search: function(text, reverse) {
		this.trace("search() : " + text + " : " + reverse);
		
		if(Firebug.FlashbugModel.selectedReader.removeHighlight) {
			Firebug.FlashbugModel.selectedReader.removeHighlight();
			if (!text) return;
			
			return Firebug.FlashbugModel.selectedReader.highlight(text);
		}
		
		return;
    },
	
	///////////////////////
	// Flashbug Specific //
	///////////////////////
	
	selectLog: function() {
		this.trace("selectLog() - " + getPref(FirebugPrefDomain, "flashbug.defaultTab") + " / " + this.panelNode.id);
		if (this.panelNode.selectedText) this.panelNode.selectedText.removeAttribute("selected");
		this.panelNode.selectedText = getChildByClass(this.panelNode.firstChild, "flashbugInfo" + getPref(FirebugPrefDomain, "flashbug.defaultTab") + "Text");
		this.panelNode.selectedText.setAttribute("selected", "true");
		
		this.refreshChrome();
		
		this.trace("updateScroll");
		this.updateScroll();
	},
	
	refreshElements: function() {
		this.trace("refreshElements");
		var chrome = this.context ? this.context.chrome : FirebugChrome;
		this.txtVersion = 	chrome.$("txtVersion");
		this.cbTrace = 		chrome.$("flashbugLogFilter-trace");
		this.cbPolicy = 	chrome.$("flashbugLogFilter-policy");
		this.cbCookie = 	chrome.$("flashbugLogFilter-cookie");
		this.btnPlayPause = chrome.$("flbPlayPause");
		this.btnClear = 	chrome.$("flbClear");
		this.btnOpen = 		chrome.$("flbOpen");
		this.btnRefresh = 	chrome.$("flbRefresh");
		this.btnDownload = 	chrome.$("fbFlashbugDownload");
	},
	
	refreshChrome: function() {
		this.trace("refreshChrome");
		
		// If Firebug is opened in a window first, selectedReader might not exist yet
		if(Firebug.FlashbugModel.selectedReader) {
			if(!Firebug.FlashbugModel.selectedReader.paused) {
				this.btnPlayPause.setAttribute("label", $FL_STR("flashbug.menu.pause"));
				this.btnPlayPause.setAttribute("tooltiptext", $FL_STR("flashbug.menu.pauseToolTip"));
				this.btnPlayPause.setAttribute("command", "cmd_flbPause");
				this.btnPlayPause.setAttribute("image", "chrome://flashbug/skin/pause.png");
			} else {
				this.btnPlayPause.setAttribute("label", $FL_STR("flashbug.menu.play"));
				this.btnPlayPause.setAttribute("tooltiptext", $FL_STR("flashbug.menu.playToolTip"));
				this.btnPlayPause.setAttribute("command", "cmd_flbPlay");
				this.btnPlayPause.setAttribute("image", "chrome://flashbug/skin/play.png");
			}
			
			if(Firebug.FlashbugModel.selectedReader == Firebug.FlashbugModel.solReader) {
				collapse(this.btnPlayPause, true);
				collapse(this.btnClear, true);
				collapse(this.btnOpen, true);
				collapse(this.btnRefresh, false);
			} else {
				collapse(this.btnPlayPause, false);
				collapse(this.btnClear, false);
				collapse(this.btnOpen, false);
				collapse(this.btnRefresh, true);
			}
		}
	},
	
	// From swfobject 2.1
	getJSPlayerVersion: function() {
		var version = $FL_STR("flashbug.noPlayer");
		// Description = 'Shockwave Flash 10.1 r53'
		var d = navigator.plugins["Shockwave Flash"].description;
		if (d && !(typeof navigator.mimeTypes != "undefined" && navigator.mimeTypes["application/x-shockwave-flash"] && !navigator.mimeTypes["application/x-shockwave-flash"].enabledPlugin)) { // navigator.mimeTypes["application/x-shockwave-flash"].enabledPlugin indicates whether plug-ins are enabled or disabled in Safari 3+
			version = Flashbug.getOS().toUpperCase() + " ";
			
			// Firefox 3.6+
			if(navigator.plugins["Shockwave Flash"].version) {
				// Version = '10.1.53.64'
				d = navigator.plugins["Shockwave Flash"].version;
				d = d.replace(/\./g, ',');
				version += d + " ";
			} else {
				d = d.replace(/^.*\s+(\S+\s+\S+$)/, "$1");
				version += parseInt(d.replace(/^(.*)\..*$/, "$1"), 10) + ",";
				version += parseInt(d.replace(/^.*\.(.*)\s.*$/, "$1"), 10) + ",";
				version += /[r|d]/.test(d) ? parseInt(d.replace(/^.*[r|d](.*)$/, "$1"), 10) : 0;
				version += ",X ";
			}
			version += $FL_STR("flashbug.unknownVersion");
		}
		this.trace("getJSPlayerVersion - " + version);
		return version;
	},
	
	showVersion: function() {
		var version = Firebug.FlashbugModel.playerVersion == "" ? Firebug.FlashbugModel.jsPlayerVersion : Firebug.FlashbugModel.playerVersion;
		this.trace("showVersion : '" + version + "'");
		
		// If we know for sure they have the debugger, hide link
		if(version.indexOf("Debug") != -1) this.btnDownload.style.display = 'none';
		
		this.txtVersion.value = $FL_STR("flashbug.playerVersion") + version;
		this.txtVersion.setAttribute("value", $FL_STR("flashbug.playerVersion") + version);
	}
});

// Firebug Registration
//-----------------------------------------------------------------------------

// For backward compatibility with Firebug 1.1
if (Firebug.ActivableModule) {
    Firebug.registerActivableModule(Firebug.FlashbugModel);
    Firebug.registerActivableModule(Firebug.AMFInfoTab);
} else {
    Firebug.registerModule(Firebug.FlashbugModel);
    Firebug.registerModule(Firebug.AMFInfoTab);
}

Firebug.registerPanel(FlashbugPanel);

Firebug.registerRep(
    Firebug.FlashbugModel.CookieTable,          // Cookie table with list of cookies
    Firebug.FlashbugModel.CookieRow             // Entry in the cookie table
);

//-----------------------------------------------------------------------------

FBTrace.DBG_FLASH = 		getPref(FirebugPrefDomain, "DBG_FLASH");
FBTrace.DBG_FLASH_SOL = 	getPref(FirebugPrefDomain, "DBG_FLASH_SOL");
FBTrace.DBG_FLASH_AMF = 	getPref(FirebugPrefDomain, "DBG_FLASH_AMF");
FBTrace.DBG_FLASH_AMF3 = 	getPref(FirebugPrefDomain, "DBG_FLASH_AMF3");
FBTrace.DBG_FLASH_AMF0 = 	getPref(FirebugPrefDomain, "DBG_FLASH_AMF0");
FBTrace.DBG_FLASH_LOG = 	getPref(FirebugPrefDomain, "DBG_FLASH_LOG");
FBTrace.DBG_FLASH_PANEL = 	getPref(FirebugPrefDomain, "DBG_FLASH_PANEL");
FBTrace.DBG_FLASH_MODEL = 	getPref(FirebugPrefDomain, "DBG_FLASH_MODEL");

//-----------------------------------------------------------------------------

}});

function objFlash_DoFSCommand(command, args) {
	switch (command) {
		case "init":
			// If Flashbug had an error loading, don't use it
			if(Firebug.FlashbugModel) {
				Firebug.FlashbugModel.playerVersion = unescape(args);
				
				// Call showVersion once the SWF has updated the value
				//if(FirebugChrome && FirebugChrome.getSelectedPanel().name == "flashbug") FirebugChrome.getSelectedPanel().showVersion();
				if(FirebugContext) FirebugContext.getPanel("flashbug").showVersion();
			}
			break;
	}
}