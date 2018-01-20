FBL.ns(function() { with (FBL) {

// Constants
const panelName = "sharedObjects";
const SWF_MIME = "application/x-shockwave-flash";
const SPL_MIME = "application/x-futuresplash";

var $FL_STR = Flashbug.$FL_STR,
$FL_STRF = Flashbug.$FL_STRF;

function openPath(url) {
	Firebug.FlashbugSOLModel.trace("openPath");
	var f = CCIN("@mozilla.org/file/local;1", "nsILocalFile");
	f.initWithPath(url);
	Flashbug.launchFile(f);
}

// Asks the operating system to open the folder which contains this file or folder. 
// This routine only works on platforms which support the ability to open a folder. 
function revealPath(url) {
	Firebug.FlashbugSOLModel.trace("revealPath");
	var f = CCIN("@mozilla.org/file/local;1", "nsILocalFile");
	f.initWithPath(url);
	
	try {
		f.reveal();
	} catch (ex) {
		// If reveal fails for some reason (e.g., it's not implemented on unix or
		// the file doesn't exist), try using the parent if we have it.
		var parent = QI(f.parent, Ci.nsILocalFile);
		if (!parent) return;
		
		// "Double click" the parent directory to show where the file should be
		openPath(parent.path);
	}
}

// Module Implementation
//-----------------------------------------------------------------------------

Firebug.FlashbugSOLModel = extend(Firebug.ActivableModule, {
	
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
	// Shared Objects Module                                                                    //
	//////////////////////////////////////////////////////////////////////////////////////////////
	
	trace: function(msg, obj) {
		msg = "Flashbug - SO Model::" + msg;
		if (FBTrace.DBG_FLASH_SOL_MODEL) {
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
	
	/**
	* Called by Firebug when Firefox window is opened.
	*/
	initialize: function() {
		this.trace("initialize");
		
		var dir = Flashbug.getFlashPlayerDirectory();
		dir.append("#SharedObjects");
		var entries = dir.directoryEntries;
		var entry;
		while(entries.hasMoreElements()) {
			entry = entries.getNext();
			entry.QueryInterface(Components.interfaces.nsIFile);
			if(entry.isDirectory()) break;
		}
		this.dir = entry;
		
		Firebug.NetMonitor.addListener(this);
	},
	
	internationalizeUI: function(doc) {
		this.trace("internationalizeUI");
        var elements = ["flbRefresh", "flbDeleteAll", "fbFlashbugDownload", "flbVersion"];
        var attributes = ["label", "tooltiptext", "value"];
		
        Flashbug.internationalizeElements(doc, elements, attributes);
    },
	
	/**
	* Called by Firebug when Firefox window is closed.
	*/
    shutdown: function() {
		this.trace("shutdown");
		Firebug.NetMonitor.removeListener(this);
    },
	
	/*
	* After "onSelectingPanel", a panel has been selected but is not yet visible
	*/
    showPanel: function(browser, panel) {
		this.trace("showPanel " + panelName, panel);
		
        var isFlashPanel = panel && panel.name == panelName;
        collapse(Firebug.chrome.$("fbFlashbugSOButtons"), !isFlashPanel);
        collapse(Firebug.chrome.$("fbFlashbugVersion"), !isFlashPanel);
		
		if (isFlashPanel) {
			// Append CSS
			var doc = panel.document;
			if ($("flashbugStyles", doc)) {
				// Don't append the stylesheet twice. 
			} else {
				var styleSheet = createStyleSheet(doc, "chrome://flashbug/skin/flashbug.css");
				styleSheet.setAttribute("id", "flashbugStyles");
				addStyleSheet(doc, styleSheet);
			}
		}
    },
	
	/**
	* Called when a new context is created but before the page is loaded.
	*/
	initContext: function(context, persistedState) {
		this.trace("initContext");
		
		// Create sub-context for solDomains. The solDomains object exists within the context even if the panel is disabled
        context.solDomains = {};
    },
	
	/**
	* Called when a context is destroyed. Module may store info on persistedState for reloaded pages.
	*/
	destroyContext: function(context) {
		this.trace("destroyContext");
        delete context.solDomains;
    },
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Firebug Activation

	// When the number of activeContexts decreases to zero. Modules should remove listeners, disable function that takes resources
	/*onSuspendFirebug: function() {
		// Suspend only if enabled
        if (Firebug.NetMonitor.isAlwaysEnabled()) TabWatcher.iterateContexts(unmonitorContext);
	},*/

	// When the number of activeContexts increases from zero. Modules should undo the work done in onSuspendFirebug
	/*onResumeFirebug: function() {
		// Resume only if enabled
        if (Firebug.NetMonitor.isAlwaysEnabled()) TabWatcher.iterateContexts(monitorContext);
	},*/
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Observers (dependencies)

	/**
	* This method is called if an observer (e.g. {@link Firebug.Panel}) is added or removed.
	* The module should decide about activation/deactivation upon existence of at least one
	* observer.
	*/
	/*onObserverChange: function(observer) {
		if(this.hasObservers()) {
			Firebug.NetMonitor.addListener(this);
		} else {
			Firebug.NetMonitor.removeListener(this);
		}
	},*/
	
	/////////////////////////////
	// Shared Objects Specific //
	/////////////////////////////
	
	dispatchName: "Shared Objects",
	description: $FL_STR("flashbug.solPanel.description"),
	dir: null,
	
	onResponse: function(context, file) {
		//this.trace("onResponse");
		this.addDomain(context, file.request, file.request.URI.asciiSpec);
	},
	
	onCachedResponse: function(context, file) {
		//this.trace("onCachedResponse");
		this.addDomain(context, file.request, file.request.URI.asciiSpec);
	},
	
	onExamineResponse: function(context, request) {
		//this.trace("onExamineResponse");
		this.addDomain(context, request, request.URI.asciiSpec);
	},
	
	onExamineCachedResponse: function(context, request) {
		//this.trace("onExamineCachedResponse");
		this.addDomain(context, request, request.URI.asciiSpec);
	},
	
	addDomain: function(context, request, href) {
		//this.trace("addDomain");
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
		var mimeType = Firebug.NetMonitor.Utils.getMimeType(safeGetContentType(request), href);
		//this.trace("addDomain: mimeType" + mimeType, context.solDomains);
		
		// For some reason this isn't always available
		if (!context.hasOwnProperty("solDomains")) context.solDomains = {};
		
		// If is a SWF, add domain(s)
		if(mimeType == SWF_MIME || mimeType == SPL_MIME) {
			var hasAdded = false;
			if (!context.solDomains[domain]) {
				context.solDomains[domain] = domain;
				hasAdded = true;
				this.trace("addDomain: " + context.solDomains[domain]);
			}
			
			if (!context.solDomains[fullDomain]) {
				context.solDomains[fullDomain] = fullDomain;
				hasAdded = true;
				this.trace("addDomain: " + context.solDomains[fullDomain]);
			}
			
			if (!context.solDomains[baseDomain]) {
				context.solDomains[baseDomain] = baseDomain;
				hasAdded = true;
				this.trace("addDomain: " + context.solDomains[baseDomain]);
			}
			
			// Refresh the panel asynchronously.
			if(hasAdded && context instanceof Firebug.TabContext) context.invalidatePanels(panelName); 
		}
	},
	
	refresh: function(context) {
		this.trace("refresh");
		
		var panel = context.getPanel(panelName, true);
		if(panel) panel.refresh();
	},
	
	deleteAll: function(context) {
		this.trace("deleteAll");
		
		var panel = context.getPanel(panelName, true);
		if(panel) panel.deleteAll();
	}
});

// DOMPlate Implementation
//-----------------------------------------------------------------------------

/**
 * @domplate Represents a template for basic cookie list layout. This
 * template also includes a header and related functionality (such as sorting).
 */
Firebug.FlashbugSOLModel.CookieTable = domplate(Firebug.FlashbugModel.Rep, {
    inspectable: false,

    tableTag:
        TABLE({class: "flb-so-table", cellpadding: 0, cellspacing: 0, hiddenCols: ""},
            TBODY(
                TR({class: "flb-so-header-row", onclick: "$onClickHeader"},
                    TD({id: "colName", class: "flb-so-header-cell alphaValue"},
                        DIV({class: "flb-so-header-cell-box", title: $FL_STR("flashbug.solPanel.colName.tooltip")}, $FL_STR("flashbug.solPanel.colName.title"))
                    ),
                    TD({id: "colVersion", class: "flb-so-header-cell alphaValue"},
                        DIV({class: "flb-so-header-cell-box", title: $FL_STR("flashbug.solPanel.colVersion.tooltip")}, $FL_STR("flashbug.solPanel.colVersion.title"))
                    ),
                    TD({id: "colSize", class: "flb-so-header-cell"},
                        DIV({class: "flb-so-header-cell-box", title: $FL_STR("flashbug.solPanel.colSize.tooltip")}, $FL_STR("flashbug.solPanel.colSize.title"))
                    ),
					TD({id: "colSWF", class: "flb-so-header-cell"},
                        DIV({class: "flb-so-header-cell-box", title: $FL_STR("flashbug.solPanel.colSWF.tooltip")}, $FL_STR("flashbug.solPanel.colSWF.title"))
                    ),
                    TD({id: "colPath", class: "flb-so-header-cell alphaValue"},
                        DIV({class: "flb-so-header-cell-box", title: $FL_STR("flashbug.solPanel.colPath.tooltip")}, $FL_STR("flashbug.solPanel.colPath.title"))
                    )
                )
            )
        ),

    onClickHeader: function(event) {
        if (!isLeftClick(event)) return;
        var table = getAncestorByClass(event.target, "flb-so-table");
        var column = getAncestorByClass(event.target, "flb-so-header-cell");
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
        var headerSorted = getChildByClass(headerRow, "flb-so-header-sorted");
        removeClass(headerSorted, "flb-so-header-sorted");
		
        // Mark new column as sorted.
        var header = headerRow.childNodes[colIndex];
        setClass(header, "flb-so-header-sorted");
		
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
		Firebug.getPref(Firebug.prefDomain, "flashbug.lastSortedColumn", prefValue);
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

/**
 * @domplate Represents a domplate template for cookie entry in the cookie list.
 */
Firebug.FlashbugSOLModel.CookieRow = domplate(Firebug.FlashbugModel.Rep, {
    inspectable: false,
	
	trace: Firebug.FlashbugSOLModel.trace,
	ERROR: ERROR,

    cookieTag:
        FOR("cookie", "$cookies",
            TR({class: "flb-so-row", _repObject: "$cookie", onclick: "$onClickRow"},
                TD({class: "flb-so-name-col flb-so-col"},
                    DIV({class: "flb-so-name-label flb-so-label"}, "$cookie|getName")
                ),
                TD({class: "flb-so-version-col flb-so-col"},
                    SPAN({class: "flb-so-version-label flb-so-label"}, "$cookie|getVersion")
                ),
                TD({class: "flb-so-size-col flb-so-col"},
                    DIV({class: "flb-so-size-label flb-so-label"}, "$cookie|getSize")
                ),
				TD({class: "flb-so-swf-col flb-so-col"},
                    DIV({class: "flb-so-swf-label flb-so-label"}, "$cookie|getSWF")
                ),
                TD({class: "flb-so-path-col flb-so-col"},
                    DIV({class: "flb-so-path-label flb-so-label", title: "$cookie|getPath"},
                        SPAN("$cookie|getPath")
                    )
                )
            )
        ),

    bodyRow:
        TR({class: "cookieInfoRow"},
            TD({class: "flb-so-info-col", colspan: 5},
				DIV({class: "flb-so-info-body"},
					DIV({class: "cookieInfoValueText flb-so-info-text", selected:true})
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
        return formatSize(cookie.fileSize);
    },
	
	getSWF: function(cookie) {
		var swf = cookie.swf;
		if(swf.indexOf(".swf") == -1) swf = null;
        return swf ? swf : "?";
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
	
	onRemove: function(url, context) {
		var file = CCIN("@mozilla.org/file/local;1", "nsILocalFile");
		file.initWithPath(url);
		
		if(file.exists()) {
			try {
				file.remove(false);
			} catch (e) {
				this.ERROR(e);
			}
		}
		
		Firebug.FlashbugSOLModel.refresh(context);
	},
	
	getContextMenuItems: function(data, target, context) {
        var items = [];
		var url = data.fullPath;
		
		// xxxHonza not sure how to do this better if the default Firebug's "Copy"
        // command (cmd_copy) shouldn't be there.
        var popup = $("fbContextMenu");
        if (popup.firstChild && popup.firstChild.getAttribute("command") == "cmd_copy") popup.removeChild(popup.firstChild);
		
		items.push(
			{label: $FL_STR("flashbug.contextMenu.delete"), nol10n: true, command: bindFixed(this.onRemove, this, url, context) },
			"-",
			{label: $FL_STR("flashbug.contextMenu.open"), nol10n: true, command: bindFixed(openPath, this, url) },
			{label: $FL_STR("flashbug.contextMenu.openFolder"), nol10n: true, command: bindFixed(revealPath, this, url) },
			"-",
			{label: $FL_STR("flashbug.contextMenu.copyLocation"), nol10n: true, command: bindFixed(copyToClipboard, FBL, url) }
		);
		
        return items;
    },

    onClickRow: function(event) {
        if (isLeftClick(event)) {
            var row = getAncestorByClass(event.target, "flb-so-row");
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

function FlashbugSOLPanel() { }
FlashbugSOLPanel.prototype = extend(Firebug.ActivablePanel, {
    
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
		msg = "Flashbug - SO Panel::" + msg;
		if (FBTrace.DBG_FLASH_SOL_PANEL) {
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
	
	// clicking on contents in the panel will invoke the inline editor, eg the CSS Style panel or HTML panel.
	editable: false,
	
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
		
		this.showVersion();
		this.refresh();
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
		
		// Do we have access to the context, if so, parse
		if(this.context && this.context.solDomains) {
			this.files = this.getSharedObjectsFiles(this.context);
		} else {
			return;
		}
		
		// Create cookie list table.
        Firebug.FlashbugSOLModel.CookieTable.createTable(this.panelNode);
		
		// Parse Files
		this.sols = [];
		if(this.files) {
			var t = this;
			for (var i = 0; i < this.files.length; ++i) {
				try {
					var worker = new Worker("chrome://flashbug/content/lib/SOLWorker.js");
					worker.onmessage = function(event) {
						var idx = event.data.fileID;
						var file = t.files[idx];
						var data = event.data.data;
						t.trace("Worker message file", file);
						t.trace("Worker message data", data);
						data.fileSize = file.fileSize;
						data.fullPath = file.path;
						data.swf = file.parent.leafName;
						data.path = file.path.replace(Firebug.FlashbugSOLModel.dir.path, "");
						data.path = data.path.replace(file.leafName, "");
						t.onParseComplete(data);
					};
					worker.onerror = function(error) {
						t.trace("Worker error: " + error.message + "\n");
						throw error;
					};
					
					var input = CCIN("@mozilla.org/network/file-input-stream;1", "nsIFileInputStream");
					input.init(this.files[i], -1, -1, false);
					var contentText = Flashbug.readFromStream(input);
					worker.postMessage({text:contentText, fileID:i});
				} catch (e) {
					ERROR(e);
				}
			}
		}
	},
	
	deleteAll: function() {
		this.trace("deleteAll");
		for (var i = 0; i < this.files.length; ++i) {
			var file = this.files[i];
			if(file.exists()) {
				try {
					file.remove(false);
				} catch (e) {
					this.ERROR(e);
				}
			}
		}
		
		Firebug.FlashbugSOLModel.refresh(this.context);
	},
	
	onParseComplete: function(data) {
		this.trace("onParseComplete", data);
		this.sols.push(data);
		
		// Create cookie list table.
        Firebug.FlashbugSOLModel.CookieTable.createTable(this.panelNode);
		
		// Generate HTML list of cookies using domplate.
        if (this.sols.length) {
            var header = getElementByClass(this.panelNode, "flb-so-header-row");
            var tag = Firebug.FlashbugSOLModel.CookieRow.cookieTag;
            var row = tag.insertRows({cookies: this.sols}, header)[0];
            for (var i = 0; i < this.sols.length; ++i) {
                var cookie = this.sols[i];
                cookie.row = row;
                row.repObject = cookie;
                row = row.nextSibling;
            }
        }
		
		Firebug.ActivablePanel.refresh.apply(this, arguments);
	},
	
	// persistedPanelState plus non-persisted hide() values
	show: function(state) {
		this.trace("show " + state + " / " + this.panelNode);
		this.showToolbarButtons("fbFlashbugVersion", true);
	},
	
	// store info on state for next show.
	hide: function(state) {
		this.trace("hide");
		this.showToolbarButtons("fbFlashbugVersion", false);
	},
	
	// Called when "Options" clicked. Return array of
    // {label: 'name', nol10n: true,  type: "checkbox", checked: <value>, command:function to set <value>}
	getOptionsMenuItems: function(context) {
		this.trace("getOptionsMenuItems");
		return [
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
	
	/////////////////////////////
	// Shared Objects Specific //
	/////////////////////////////
	
	name: panelName,
    title: $FL_STR("flashbug.solPanel.title"),
	files: [],
	sols: [],
	
	// Gets all shared objects for each domain
	getSharedObjectsFiles: function(context) {
		this.trace("getSharedObjectsFiles");
		var arrFiles = [];
		try {
		for (var key in context.solDomains) {
			var dir2 = CCIN("@mozilla.org/file/local;1", "nsILocalFile");
			dir2.initWithPath(Firebug.FlashbugSOLModel.dir.path);
			dir2.append(context.solDomains[key]);
			this.getFiles(arrFiles, dir2);
		}
		} catch(err){
			ERROR(err);
		}
		
		this.trace("getSharedObjectsFiles - Files", arrFiles);
		return arrFiles;
	},
	
	// Recursively runs through all folders searching for files
	getFiles: function(arrFiles, dir) {
		this.trace("getFiles");
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
	
	showVersion: function() {
		var version = Firebug.FlashbugModel.playerVersion == "" ? Firebug.FlashbugModel.jsPlayerVersion : Firebug.FlashbugModel.playerVersion;
		this.trace("showVersion : '" + version + "'");
		
		// If we know for sure they have the debugger, hide link
		if(version.indexOf("Debug") != -1) Firebug.chrome.$("fbFlashbugDownload").style.display = 'none';
		
		Firebug.chrome.$("flbVersion").value = $FL_STR("flashbug.playerVersion") + " " + version;
	}
});


//////////////////////////
// Firebug Registration //
//////////////////////////

var fbVersion = Firebug.version.split('.');
if (fbVersion[0] >= 1 && fbVersion[1] >= 6) {
	Firebug.registerRep(
		Firebug.FlashbugSOLModel.CookieTable,          // Cookie table with list of cookies
		Firebug.FlashbugSOLModel.CookieRow             // Entry in the cookie table
	);
	Firebug.registerActivableModule(Firebug.FlashbugSOLModel);
	Firebug.registerPanel(FlashbugSOLPanel);
}

/////////////////////////////
// Firebug Trace Constants //
/////////////////////////////

FBTrace.DBG_FLASH_SOL_MODEL = 	Firebug.getPref(Firebug.prefDomain, "DBG_FLASH_SOL_MODEL");
FBTrace.DBG_FLASH_SOL_PANEL = 	Firebug.getPref(Firebug.prefDomain, "DBG_FLASH_SOL_PANEL");
FBTrace.DBG_FLASH_SOL = 	Firebug.getPref(Firebug.prefDomain, "DBG_FLASH_SOL");
FBTrace.DBG_FLASH_AMF3 = 	Firebug.getPref(Firebug.prefDomain, "DBG_FLASH_AMF3");
FBTrace.DBG_FLASH_AMF0 = 	Firebug.getPref(Firebug.prefDomain, "DBG_FLASH_AMF0");

}});